import { createHmac, timingSafeEqual } from 'node:crypto';
import { handleUpload } from '@vercel/blob/client';

export function verifyTicket(ticket, secret) {
  if (typeof ticket !== 'string' || ticket.length > 4096) throw new Error('Autorização de upload inválida.');
  const [payload, signature, extra] = ticket.split('.');
  if (!payload || !signature || extra) throw new Error('Autorização de upload inválida.');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error('Autorização de upload inválida.');
  const job = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (!Number.isSafeInteger(job.exp) || job.exp < Date.now() / 1000 || !Number.isSafeInteger(job.size) || job.size < 1 || job.size > 50_000_000 || !/^uploads\/[a-f0-9]{32}\/source\.[a-z0-9]+$/.test(job.pathname)) throw new Error('Autorização expirada ou inválida.');
  return job;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST para enviar um arquivo.' });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return response.status(503).json({ error: 'Conecte um Vercel Blob Store privado e configure BLOB_READ_WRITE_TOKEN para enviar arquivos grandes.' });
  try {
    const result = await handleUpload({
      body: request.body,
      request,
      token,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const job = verifyTicket(clientPayload, token);
        if (pathname !== job.pathname) throw new Error('O caminho do upload não corresponde à autorização.');
        return {
          maximumSizeInBytes: job.size,
          allowedContentTypes: ['application/octet-stream'],
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Math.min(job.exp * 1000, Date.now() + 15 * 60 * 1000),
        };
      },
    });
    return response.status(200).json(result);
  } catch {
    return response.status(400).json({ error: 'Não foi possível autorizar o upload. Atualize a página e tente novamente.' });
  }
}
