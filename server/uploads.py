"""Signed upload capabilities and bounded reads from private Vercel Blob storage."""

import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import time

MAX_UPLOAD_BYTES = 50_000_000


class UploadError(ValueError):
    pass


def configured():
    return bool(os.getenv("BLOB_READ_WRITE_TOKEN"))


def _secret():
    value = os.getenv("BLOB_READ_WRITE_TOKEN")
    if not value:
        raise UploadError("Conecte um Vercel Blob Store privado e configure BLOB_READ_WRITE_TOKEN para enviar arquivos maiores que 4,49 MB.")
    return value.encode()


def _encode(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _decode(value):
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_job(filename, size):
    if type(size) is not int or not 0 < size <= MAX_UPLOAD_BYTES:
        raise UploadError("O limite é de 50 MB por arquivo.")
    job = {"filename": filename, "size": size, "pathname": f"uploads/{secrets.token_hex(16)}/source{Path(filename).suffix.lower()}", "exp": int(time.time()) + 3600}
    payload = _encode(json.dumps(job, separators=(",", ":"), ensure_ascii=False).encode())
    signature = _encode(hmac.new(_secret(), payload.encode(), hashlib.sha256).digest())
    return {**job, "ticket": f"{payload}.{signature}"}


def verify_job(ticket):
    try:
        if not isinstance(ticket, str) or len(ticket) > 4096:
            raise ValueError()
        payload, signature = ticket.split(".")
        expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_decode(signature), expected):
            raise ValueError()
        job = json.loads(_decode(payload))
        if type(job["exp"]) is not int or job["exp"] < time.time():
            raise ValueError()
        if type(job["size"]) is not int or not 0 < job["size"] <= MAX_UPLOAD_BYTES:
            raise ValueError()
        if not re.fullmatch(r"uploads/[a-f0-9]{32}/source\.[a-z0-9]+", job["pathname"]):
            raise ValueError()
        return job
    except UploadError:
        raise
    except (ValueError, KeyError, TypeError, UnicodeError) as exc:
        raise UploadError("A autorização do upload é inválida ou expirou. Envie o arquivo novamente.") from exc


def read_upload(job):
    from vercel.blob import sync as blob

    metadata = blob.head_blob(job["pathname"])
    if metadata.size != job["size"] or metadata.size > MAX_UPLOAD_BYTES:
        raise UploadError("O tamanho do arquivo recebido não corresponde ao upload autorizado.")
    data = bytearray()
    with blob.stream_blob(job["pathname"], access="private") as download:
        for chunk in download:
            if len(data) + len(chunk) > min(job["size"], MAX_UPLOAD_BYTES):
                raise UploadError("O upload ultrapassa o tamanho autorizado.")
            data.extend(chunk)
    if len(data) != job["size"]:
        raise UploadError("O arquivo recebido está incompleto. Envie novamente.")
    return bytes(data)


def delete_upload(job):
    from vercel.blob import sync as blob
    blob.delete_blob(job["pathname"])
