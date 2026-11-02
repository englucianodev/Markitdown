# MarkItDown — motor incluído

Código do motor MarkItDown usado pela aplicação web deste repositório.
Ele é incluído como fonte em `src/markitdown` e carregado diretamente pela API.
Não instale este diretório como dependência local no runtime da Vercel: o modo
`--no-build` da plataforma rejeita a instalação de distribuições locais sem wheel.

As bibliotecas necessárias aos conversores da aplicação estão declaradas no
`requirements.in` da raiz e fixadas no `requirements.txt`.

Origem: https://github.com/microsoft/markitdown
Licença: MIT; consulte `../../LICENSE` e `ThirdPartyNotices.md`.
