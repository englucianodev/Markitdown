import { upload } from '@vercel/blob/client';

export function uploadDocument(file, job, onProgress) {
  return upload(job.pathname, file, {
    access: 'private',
    handleUploadUrl: '/api/upload',
    clientPayload: job.ticket,
    contentType: 'application/octet-stream',
    multipart: true,
    onUploadProgress: ({ percentage }) => onProgress(Math.round(percentage)),
  });
}
