"""Web adapter for bundled MarkItDown source and optional private Blob uploads."""

import io
import logging
import os
from pathlib import Path, PurePosixPath
import sys
import zipfile
from functools import lru_cache
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "packages" / "markitdown" / "src"))

import bleach
import markdown
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge
from server import uploads

# Raw binary uploads: keep 10 KB below Vercel's 4.5 MB payload ceiling.
MAX_FILE_BYTES = 4_490_000
MAX_OUTPUT_BYTES = 4_490_000
MAX_EXPANDED_BYTES = 200_000_000
EXTENSIONS = frozenset({
    ".pdf", ".docx", ".pptx", ".xlsx", ".xls", ".csv", ".tsv",
    ".html", ".htm", ".txt", ".md", ".json", ".xml", ".rss",
    ".epub", ".ipynb", ".msg", ".zip", ".yaml", ".yml", ".log",
})
ARCHIVES = {".zip", ".docx", ".pptx", ".xlsx", ".epub"}
TAGS = frozenset({
    "p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em",
    "ul", "ol", "li", "blockquote", "pre", "code", "hr", "a", "table",
    "thead", "tbody", "tr", "th", "td", "del", "sup", "sub",
})

app = Flask(__name__, static_folder=str(ROOT / "public"), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = MAX_FILE_BYTES
CSP_POLICY = ("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; "
              "worker-src 'self' blob:; style-src 'self'; font-src 'self' data: blob:; "
              "img-src 'self' data: blob:; connect-src 'self' blob: https://vercel.com "
              "https://blob.vercel-storage.com https://*.blob.vercel-storage.com; "
              "frame-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")


class ConversionError(ValueError):
    pass


class EngineUnavailable(RuntimeError):
    pass


@lru_cache(maxsize=1)
def create_converter():
    # Avoid importing native document dependencies before health/config can respond.
    try:
        from markitdown import MarkItDown
        return MarkItDown(enable_plugins=False)
    except Exception as exc:
        logging.exception("Falha ao inicializar o motor MarkItDown")
        raise EngineUnavailable("O motor de conversão não iniciou. Consulte os Logs da Vercel e reinstale requirements.txt.") from exc


def inspect_archive(data, budget=None, depth=0):
    """Bound even nested OOXML/EPUB archives before giving them to parsers."""
    if budget is None:
        budget = {"bytes": 0, "entries": 0}
    if depth > 3:
        raise ConversionError("O arquivo contém níveis demais de compactação.")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for item in archive.infolist():
                budget["bytes"] += item.file_size
                budget["entries"] += 1
                if budget["bytes"] > MAX_EXPANDED_BYTES or budget["entries"] > 1500:
                    raise ConversionError("O conteúdo descompactado excede 200 MB ou 1.500 itens.")
                path = PurePosixPath(item.filename.replace("\\", "/"))
                if item.flag_bits & 1:
                    raise ConversionError("Arquivos protegidos por senha não são aceitos.")
                if path.is_absolute() or ".." in path.parts:
                    raise ConversionError("O arquivo compactado contém caminhos inválidos.")
                if not item.is_dir():
                    # Read validates CRC and detects archives disguised with other extensions.
                    member = archive.read(item)
                    if zipfile.is_zipfile(io.BytesIO(member)):
                        inspect_archive(member, budget, depth + 1)
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError) as exc:
        raise ConversionError("Arquivo compactado inválido, criptografado ou não suportado.") from exc


def convert_document(data, filename, converter=None, depth=0):
    suffix = Path(filename).suffix.lower()
    if suffix not in EXTENSIONS:
        raise ConversionError("Formato não suportado. Consulte a lista de formatos na página.")
    if not data:
        raise ConversionError("Este arquivo está vazio.")
    is_archive = zipfile.is_zipfile(io.BytesIO(data))
    if suffix in ARCHIVES and not is_archive:
        raise ConversionError("O arquivo está corrompido ou não corresponde ao formato informado.")
    if suffix == ".pdf" and b"%PDF-" not in data[:1024]:
        raise ConversionError("Este arquivo não é um PDF válido.")
    if suffix in {".xls", ".msg"} and not data.startswith(bytes.fromhex("D0CF11E0A1B11AE1")):
        raise ConversionError("O arquivo está corrompido ou não corresponde ao formato informado.")
    if is_archive:
        inspect_archive(data)
    converter = converter or create_converter()
    warnings = []
    if suffix == ".zip":
        if depth >= 2:
            raise ConversionError("Envie os documentos de ZIPs aninhados separadamente.")
        parts = []
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for item in archive.infolist():
                if item.is_dir():
                    continue
                try:
                    content, notices = convert_document(archive.read(item), item.filename, converter, depth + 1)
                    parts.append(f"## {item.filename}\n\n{content}")
                    warnings.extend(notices)
                except Exception:
                    warnings.append(f"Não foi possível converter: {item.filename}")
        if not parts:
            raise ConversionError("O ZIP não contém documentos compatíveis que possam ser convertidos.")
        text = "\n\n---\n\n".join(parts)
    else:
        from markitdown import StreamInfo
        result = converter.convert_stream(
            io.BytesIO(data), stream_info=StreamInfo(extension=suffix, filename=filename)
        )
        text = result.markdown.strip()
    if not text:
        raise ConversionError("Nenhum texto encontrado. PDFs digitalizados precisam de OCR; verifique também se o arquivo tem conteúdo e não possui senha.")
    if len(text.encode("utf-8")) > MAX_OUTPUT_BYTES:
        raise ConversionError("O texto extraído é muito grande. Divida o documento em partes menores.")
    return text, warnings


def render_result(text):
    rendered = markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
    safe = bleach.clean(rendered, tags=TAGS, attributes={"a": ["href", "title"]},
                        protocols=["http", "https", "mailto"], strip=True)
    soup = BeautifulSoup(safe, "html.parser")
    for element in soup.find_all(["p", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre"]):
        element.insert_after("\n")
    for element in soup.find_all(["td", "th"]):
        element.insert_after("\t")
    return safe, soup.get_text().strip()


@app.after_request
def private_response(response):
    if request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Content-Security-Policy"] = CSP_POLICY
    return response


@app.get("/")
def home():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/health")
def health():
    if request.args.get("check") == "conversion":
        create_converter()
    return jsonify(status="ok", direct_upload_max_bytes=MAX_FILE_BYTES,
                   max_file_bytes=uploads.MAX_UPLOAD_BYTES,
                   large_uploads_configured=uploads.configured(), extensions=sorted(EXTENSIONS))


def clean_filename(value):
    if not isinstance(value, str):
        raise ConversionError("Informe o nome do documento.")
    filename = value.replace("\\", "/").rsplit("/", 1)[-1][:200]
    if Path(filename).suffix.lower() not in EXTENSIONS:
        raise ConversionError("Formato não suportado. Consulte os formatos compatíveis.")
    return filename


def conversion_response(data, filename):
    text, notices = convert_document(data, filename)
    html, plain = render_result(text)
    response = jsonify(filename=filename, markdown=text, html=html, text=plain, warnings=notices)
    if response.calculate_content_length() > MAX_OUTPUT_BYTES:
        raise ConversionError("O resultado excede o limite de resposta. Divida o documento em partes menores.")
    return response


@app.post("/api/uploads")
def new_upload():
    if not uploads.configured():
        return jsonify(error="Para arquivos maiores que 4,49 MB, conecte um Vercel Blob Store privado ao projeto e faça um novo deploy."), 503
    payload = request.get_json()
    if not isinstance(payload, dict):
        raise ConversionError("Informe o nome e o tamanho do documento.")
    filename = clean_filename(payload.get("filename"))
    return jsonify(uploads.create_job(filename, payload.get("size")))


@app.post("/api/convert-blob")
def convert_blob():
    payload = request.get_json()
    job = uploads.verify_job(payload.get("ticket") if isinstance(payload, dict) else None)
    filename = clean_filename(job["filename"])
    try:
        return conversion_response(uploads.read_upload(job), filename)
    finally:
        try:
            uploads.delete_upload(job)
        except Exception:
            logging.warning("Não foi possível excluir um upload temporário", exc_info=True)


@app.post("/api/delete-upload")
def remove_upload():
    payload = request.get_json()
    job = uploads.verify_job(payload.get("ticket") if isinstance(payload, dict) else None)
    try:
        uploads.delete_upload(job)
    except Exception:
        logging.warning("Upload temporário não encontrado ou indisponível para exclusão")
    return jsonify(status="ok")


@app.post("/api/convert")
def convert():
    filename = unquote(request.headers.get("X-Filename", "documento.txt"))
    filename = filename.replace("\\", "/").rsplit("/", 1)[-1][:200]
    try:
        return conversion_response(request.get_data(), filename)
    except RequestEntityTooLarge:
        raise
    except (ConversionError, EngineUnavailable):
        raise
    except Exception:
        logging.exception("Falha na conversão de documento")
        return jsonify(error="Não foi possível ler o documento. Verifique se está íntegro, sem senha e em um formato compatível."), 422


@app.errorhandler(ConversionError)
@app.errorhandler(uploads.UploadError)
def invalid_document(exc):
    return jsonify(error=str(exc)), 422


@app.errorhandler(EngineUnavailable)
def unavailable_engine(exc):
    return jsonify(error=str(exc)), 503


@app.errorhandler(HTTPException)
def http_error(exc):
    return jsonify(error=f"A API respondeu com HTTP {exc.code}. Verifique a rota e o formato da requisição."), exc.code


@app.errorhandler(Exception)
def unexpected_error(exc):
    logging.exception("Erro inesperado na API")
    return jsonify(error="Falha no servidor de conversão. Consulte os Logs da Vercel."), 500


@app.errorhandler(413)
def too_large(error):
    return jsonify(error="O limite é de 4,49 MB por arquivo. Divida o documento e tente novamente."), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "3000")), debug=False)
