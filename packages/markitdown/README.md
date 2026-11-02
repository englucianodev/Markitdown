# MarkItDown — motor incluído

Código do motor MarkItDown usado pela aplicação web deste repositório.
Ele é incluído como fonte em `src/markitdown` e carregado diretamente pela API.
Não instale este diretório como dependência local no runtime da Vercel: o modo
`--no-build` da plataforma rejeita a instalação de distribuições locais sem wheel.

As bibliotecas necessárias aos conversores da aplicação estão declaradas no
`requirements.in` da raiz e fixadas no `requirements.txt`.

Modificação local para o site: o parâmetro `enable_magika=False` permite converter
arquivos com extensão validada sem instalar o detector Magika nem ONNX Runtime.
A detecção de codificação de texto permanece habilitada. O OCR do site usa
Tesseract.js no navegador e não depende desses pacotes Python.

Origem: https://github.com/microsoft/markitdown
Licença: MIT; consulte `../../LICENSE` e `ThirdPartyNotices.md`.
