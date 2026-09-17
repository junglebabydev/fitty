import { db } from '../database'
import type { ProgressPhoto } from '../../domain/types'
import { mapPhoto, type PhotoRow } from './mappers'

export function addPhoto(p: Omit<ProgressPhoto, 'id'>): number {
  return db.run(`INSERT INTO progress_photos (ts, angle, uri) VALUES (?, ?, ?)`, [p.ts, p.angle, p.uri])
}

/** Most recent first. */
export function getPhotos(): ProgressPhoto[] {
  return db.all<PhotoRow>('SELECT * FROM progress_photos ORDER BY ts DESC, id DESC').map(mapPhoto)
}

export function deletePhoto(id: number): void {
  db.run('DELETE FROM progress_photos WHERE id = ?', [id])
}
