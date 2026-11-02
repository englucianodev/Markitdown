import os
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from api.index import app, EngineUnavailable
from server import uploads


class BlobTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.env = patch.dict(os.environ, {"BLOB_READ_WRITE_TOKEN":"test-secret-never-a-real-token"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_signed_ticket_and_50mb_boundary(self):
        response = self.client.post('/api/uploads', json={"filename":"grande.pdf", "size":50_000_000})
        self.assertEqual(response.status_code, 200)
        job = uploads.verify_job(response.json['ticket'])
        self.assertEqual(job['size'], 50_000_000)
        self.assertTrue(job['pathname'].startswith('uploads/'))
        self.assertEqual(self.client.post('/api/uploads', json={"filename":"excesso.pdf", "size":50_000_001}).status_code, 422)

    def test_tampered_expired_and_foreign_tickets(self):
        job = uploads.create_job('teste.txt', 10)
        with self.assertRaises(uploads.UploadError):
            uploads.verify_job(job['ticket'] + 'changed')
        with patch('server.uploads.time.time', return_value=job['exp'] + 1):
            with self.assertRaises(uploads.UploadError):
                uploads.verify_job(job['ticket'])
        with patch.dict(os.environ, {"BLOB_READ_WRITE_TOKEN":"another-store"}):
            with self.assertRaises(uploads.UploadError):
                uploads.verify_job(job['ticket'])

    def test_private_upload_converts_and_deletes(self):
        job = uploads.create_job('grande.txt', 50_000_000)
        with patch('server.uploads.read_upload', return_value=b'Texto do arquivo grande'), patch('server.uploads.delete_upload') as delete:
            response = self.client.post('/api/convert-blob', json={"ticket":job['ticket']})
        self.assertEqual(response.status_code, 200, response.json)
        self.assertIn('Texto do arquivo grande', response.json['markdown'])
        delete.assert_called_once()

    def test_failed_conversion_also_deletes(self):
        job = uploads.create_job('corrompido.pdf', 100)
        with patch('server.uploads.read_upload', return_value=b'not a pdf'), patch('server.uploads.delete_upload') as delete:
            response = self.client.post('/api/convert-blob', json={"ticket":job['ticket']})
        self.assertEqual(response.status_code, 422)
        delete.assert_called_once()

    def test_invalid_ticket_never_reads_or_deletes(self):
        with patch('server.uploads.read_upload') as read, patch('server.uploads.delete_upload') as delete:
            response = self.client.post('/api/convert-blob', json={"ticket":"https://attacker.example/private"})
        self.assertEqual(response.status_code, 422)
        read.assert_not_called(); delete.assert_not_called()

    def test_metadata_and_stream_limits(self):
        job = uploads.create_job('teste.txt', 10)
        from vercel.blob import sync as blob
        with patch.object(blob, 'head_blob', return_value=SimpleNamespace(size=50_000_001)), patch.object(blob, 'stream_blob') as stream:
            with self.assertRaises(uploads.UploadError):
                uploads.read_upload(job)
            stream.assert_not_called()
        with patch.object(blob, 'head_blob', return_value=SimpleNamespace(size=10)), patch.object(blob, 'stream_blob') as stream:
            stream.return_value.__enter__.return_value = iter([b'x' * 11])
            with self.assertRaises(uploads.UploadError):
                uploads.read_upload(job)

    def test_missing_store_and_independent_health(self):
        with patch.dict(os.environ, {"BLOB_READ_WRITE_TOKEN":""}):
            self.assertEqual(self.client.post('/api/uploads', json={"filename":"teste.pdf", "size":5_000_000}).status_code, 503)
        with patch('api.index.create_converter', side_effect=EngineUnavailable('motor indisponivel')):
            self.assertEqual(self.client.get('/api/health').status_code, 200)
            response = self.client.get('/api/health?check=conversion')
            self.assertEqual(response.status_code, 503)
            self.assertIn('motor indisponivel', response.json['error'])


if __name__ == '__main__':
    unittest.main()
