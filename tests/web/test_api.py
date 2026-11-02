import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
if (ROOT / ".web-deps").exists():
    sys.path.insert(0, str(ROOT / ".web-deps"))

from api.index import app, inspect_archive, ConversionError, render_result


def archive_of(files):
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return data.getvalue()


class WebTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def upload(self, name, data):
        from urllib.parse import quote
        return self.client.post("/api/convert", data=data,
                                headers={"X-Filename": quote(name)},
                                content_type="application/octet-stream")

    def test_home_and_health(self):
        with self.client.get("/") as home:
            self.assertEqual(home.status_code, 200)
        response = self.client.get("/api/health")
        self.assertEqual(response.json["max_file_bytes"], 4_000_000)
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_unicode_text(self):
        response = self.upload("ação.txt", "Olá, mundo!\nDocumento de teste.".encode())
        self.assertEqual(response.status_code, 200, response.json)
        self.assertIn("Olá, mundo!", response.json["markdown"])
        self.assertEqual(response.json["filename"], "ação.txt")

    def test_html_tables_and_script_sanitization(self):
        response = self.upload("tabela.html", b"<h1>Report</h1><script>alert(1)</script><table><tr><th>Name</th><th>Total</th></tr><tr><td>Ana</td><td>10</td></tr></table>")
        self.assertEqual(response.status_code, 200, response.json)
        self.assertIn("<table>", response.json["html"])
        self.assertIn("Ana", response.json["text"])
        self.assertNotIn("<script", response.json["html"])

    def test_render_blocks_unsafe_links_images_and_attributes(self):
        html, plain = render_result('[click](javascript:alert) <img src="https://example.com/track" onerror="alert(1)"><iframe src="https://example.com"></iframe>')
        self.assertNotIn("javascript:", html)
        self.assertNotIn("<img", html)
        self.assertNotIn("<iframe", html)
        self.assertNotIn("onerror", html)

    def test_csv(self):
        response = self.upload("dados.csv", b"Nome,Valor\nAna,42\n")
        self.assertEqual(response.status_code, 200, response.json)
        self.assertIn("Ana", response.json["markdown"])

    def test_docx(self):
        from docx import Document
        document = Document(); document.add_heading("Relatorio", 1); document.add_paragraph("Conteudo do Word.")
        data = io.BytesIO(); document.save(data)
        response = self.upload("relatorio.docx", data.getvalue())
        self.assertEqual(response.status_code, 200, response.json)
        self.assertIn("Conteudo do Word", response.json["markdown"])

    def test_xlsx(self):
        from openpyxl import Workbook
        workbook = Workbook(); workbook.active.append(["Nome", "Valor"]); workbook.active.append(["Ana", 42])
        data = io.BytesIO(); workbook.save(data)
        response = self.upload("dados.xlsx", data.getvalue())
        self.assertEqual(response.status_code, 200, response.json)
        self.assertIn("Ana", response.json["markdown"])

    def test_pptx(self):
        from pptx import Presentation
        presentation = Presentation(); slide = presentation.slides.add_slide(presentation.slide_layouts[1]); slide.shapes.title.text = "Apresentacao"; slide.placeholders[1].text = "Texto do slide"
        data = io.BytesIO(); presentation.save(data)
        response = self.upload("slides.pptx", data.getvalue())
        self.assertEqual(response.status_code, 200, response.json)
        self.assertIn("Texto do slide", response.json["markdown"])

    def test_pdf(self):
        # Generate a small valid PDF without introducing another test dependency.
        stream = b"BT /F1 12 Tf 72 720 Td (Hello PDF) Tj ET"
        objects = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>", b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream"]
        pdf = b"%PDF-1.4\n"; offsets = [0]
        for i, obj in enumerate(objects, 1):
            offsets.append(len(pdf)); pdf += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"
        xref = len(pdf)
        pdf += b"xref\n0 6\n0000000000 65535 f \n" + b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:])
        pdf += f"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
        response = self.upload("teste.pdf", pdf)
        self.assertEqual(response.status_code, 200, response.json)
        self.assertIn("Hello PDF", response.json["markdown"])

    def test_zip_reports_skipped_files(self):
        response = self.upload("lote.zip", archive_of({"doc.txt": "Arquivo valido", "video.mp4": b"binary"}))
        self.assertEqual(response.status_code, 200, response.json)
        self.assertIn("Arquivo valido", response.json["markdown"])
        self.assertTrue(response.json["warnings"])

    def test_invalid_empty_and_large_inputs(self):
        self.assertEqual(self.upload("malware.exe", b"MZ binary").status_code, 422)
        self.assertEqual(self.upload("vazio.txt", b"").status_code, 422)
        self.assertEqual(self.upload("grande.txt", b"x" * 4_000_001).status_code, 413)
        self.assertEqual(self.upload("corrompido.docx", b"not a document").status_code, 422)

    def test_output_limit(self):
        with patch("api.index.convert_document", return_value=("x" * 1_500_000, [])):
            self.assertEqual(self.upload("large.txt", b"text").status_code, 422)

    def test_archive_limits_and_paths(self):
        with self.assertRaises(ConversionError):
            inspect_archive(archive_of({"../escape.txt": "blocked"}))
        with patch("api.index.MAX_EXPANDED_BYTES", 100):
            with self.assertRaises(ConversionError):
                inspect_archive(archive_of({"bomb.txt": "x" * 1000}))
        with self.assertRaises(ConversionError):
            inspect_archive(archive_of({"hidden.txt": archive_of({"../escape": "x"})}))


if __name__ == "__main__":
    unittest.main()
