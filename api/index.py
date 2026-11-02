"""Web adapter for the local MarkItDown source. No uploads are persisted."""

import io
import logging
import os
from pathlib import Path, PurePosixPath
import sys
import zipfile
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "packages" / "markitdown" / "src"))

import bleach
import markdown
from bs4 import BeautifulSoup
from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import RequestEntityTooLarge
from markitdown import MarkItDown, StreamInfo

MAX_FILE_BYTES = 4_000_000
MAX_OUTPUT_BYTES = 3_800_000
MAX_EXPANDED_BYTES = 40_000_000
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


class ConversionError(ValueError):
    pass


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
                    raise ConversionError("O conteúdo descompactado excede 40 MB ou 1.500 itens.")
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
    converter = converter or MarkItDown(enable_plugins=False)
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
        result = converter.convert_stream(
            io.BytesIO(data), stream_info=StreamInfo(extension=suffix, filename=filename)
        )
        text = result.markdown.strip()
    if not text:
        raise ConversionError("Nenhum texto encontrado. PDFs digitalizados precisam de OCR; verifique também se o arquivo tem conteúdo e não possui senha.")
    if len(text.encode("utf-8")) > 1_000_000:
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
    return response


@app.get("/")
def home():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/api/health")
def health():
    return jsonify(status="ok", max_file_bytes=MAX_FILE_BYTES, extensions=sorted(EXTENSIONS))


@app.post("/api/convert")
def convert():
    filename = unquote(request.headers.get("X-Filename", "documento.txt"))
    filename = filename.replace("\\", "/").rsplit("/", 1)[-1][:200]
    try:
        text, notices = convert_document(request.get_data(), filename)
        html, plain = render_result(text)
        response = jsonify(filename=filename, markdown=text, html=html, text=plain, warnings=notices)
        if response.calculate_content_length() > MAX_OUTPUT_BYTES:
            raise ConversionError("O resultado excede o limite de resposta. Divida o documento em partes menores.")
        return response
    except RequestEntityTooLarge:
        raise
    except ConversionError as exc:
        return jsonify(error=str(exc)), 422
    except Exception:
        logging.exception("Falha na conversão de documento")
        return jsonify(error="Não foi possível ler o documento. Verifique se está íntegro, sem senha e em um formato compatível."), 422


@app.errorhandler(413)
def too_large(error):
    return jsonify(error="O limite é de 4 MB por arquivo. Divida o documento e tente novamente."), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.getenv("PORT", "3000")), debug=False)
