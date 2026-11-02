import base64
import io
import sys
import zipfile

with zipfile.ZipFile(io.BytesIO(base64.b64decode(sys.stdin.read()))) as archive:
    assert archive.testzip() is None
    assert len(set(name.lower() for name in archive.namelist())) == 3
    assert archive.read(archive.namelist()[0]).decode() == "# Olá\nTeste de UTF-8."
    print("ZIP: CRC32, Unicode, conteúdo e nomes duplicados OK")
