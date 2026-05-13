import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ApiError {
  code: string;
  detail?: string;
  http: number;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  get<T>(path: string, params?: Record<string, string | number | boolean>): Observable<T> {
    return this.http.get<T>(this.url(path), {
      params: this.buildParams(params),
      withCredentials: true,
    }).pipe(catchError(mapHttpError));
  }
  post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(this.url(path), body, { withCredentials: true })
      .pipe(catchError(mapHttpError));
  }
  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body, { withCredentials: true })
      .pipe(catchError(mapHttpError));
  }
  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path), { withCredentials: true })
      .pipe(catchError(mapHttpError));
  }

  private url(path: string): string {
    return `${this.base}${path.startsWith('/') ? '' : '/'}${path}`;
  }
  private buildParams(p?: Record<string, string | number | boolean>): HttpParams | undefined {
    if (!p) return undefined;
    let hp = new HttpParams();
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined || v === null) continue;
      hp = hp.set(k, String(v));
    }
    return hp;
  }
}

function mapHttpError(err: unknown): Observable<never> {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { error?: string; detail?: string } | null;
    const apiErr: ApiError = {
      code: body?.error || `HTTP_${err.status}`,
      detail: body?.detail,
      http: err.status,
    };
    return throwError(() => apiErr);
  }
  return throwError(() => ({ code: 'UNKNOWN', http: 0, detail: String(err) } as ApiError));
}
