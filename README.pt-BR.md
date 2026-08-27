# Exemplos da API Salesbud

Integrações que rodam contra a [API Salesbud](https://docs.salesbud.com.br/pt-br/) — em Node.js e
Python, sem framework e quase sem dependência.

O contrato está na [documentação](https://docs.salesbud.com.br/pt-br/). Este repositório é para as
partes que erram com facilidade no código.

*Read in [English](README.md).*

## O que cada cliente já resolve

Três coisas respondem pela maioria dos bugs que vemos em primeira integração. Os dois clientes
tratam delas, então dá para copiar o arquivo para o seu projeto e seguir.

**1. [Renovação de token](https://docs.salesbud.com.br/pt-br/guides/authentication/).** Client
credentials não tem refresh token — isso é
[por desenho](https://www.rfc-editor.org/rfc/rfc6749#section-4.4.3), não omissão, já que não há
usuário para reconsentir. Renovar é pedir um token novo. Só por relógio não basta: uma credencial
pode ser revogada antes do prazo acabar, então um `401` também dispara uma retentativa com token
novo.

**2. [Paginação](https://docs.salesbud.com.br/pt-br/guides/pagination/).** Uma página pode voltar
**curta, ou até vazia, com `has_more` em `true`** — o serviço limita quanto varre por requisição.
Iterar por `data.length` trunca a travessia em silêncio. Os dois clientes seguem o `next_cursor` e
nunca olham quantos registros a página trouxe.

**3. [Retentativas](https://docs.salesbud.com.br/pt-br/guides/rate-limits/).** `429` espera o
`Retry-After`; `503` faz backoff exponencial com jitter; todo outro 4xx falha na hora, porque
repetir requisição inválida falha igual.

## Obtendo credenciais

As credenciais são emitidas pela Salesbud para a sua empresa; não são self-service. Fale com seu
contato na Salesbud, que também confirma se a feature `API_ACCESS` está ligada.

O secret aparece uma única vez, na criação. Guarde num gerenciador de segredos — não dá para lê-lo
depois, só rotacionar.

## Node.js

Precisa de Node 18 ou mais novo. Sem dependências.

```bash
cd node
cp .env.example .env        # preencha suas credenciais
export $(grep -v '^#' .env | xargs)

node examples/01-authenticate.js
node examples/02-list-meetings.js 2026-01-01T00:00:00Z
node examples/03-list-calls.js
node examples/04-get-transcript.js mtg_...
```

```js
import { SalesbudClient } from "./src/salesbud-client.js";

const client = new SalesbudClient({ clientId, clientSecret });

for await (const meeting of client.meetings({ meeting_after: "2026-01-01T00:00:00Z" })) {
  console.log(meeting.id, meeting.title);
}
```

## Python

Precisa de Python 3.10 ou mais novo. A única dependência é `requests`.

```bash
cd python
python -m venv .venv && source .venv/bin/activate
pip install -e .            # coloca o `salesbud` no path

cp .env.example .env        # preencha suas credenciais
export $(grep -v '^#' .env | xargs)

python examples/01_authenticate.py
python examples/02_list_meetings.py 2026-01-01T00:00:00Z
python examples/03_list_calls.py
python examples/04_get_transcript.py mtg_...
```

```python
from salesbud import SalesbudClient

client = SalesbudClient.from_env()

for meeting in client.meetings(meeting_after="2026-01-01T00:00:00Z"):
    print(meeting["id"], meeting["title"])
```

## Postman

O `postman/` traz a API inteira como collection, com a renovação de token e a caminhada por cursor
já resolvidas. Importe os dois arquivos, selecione o environment **Salesbud API**, preencha
`client_id` e `client_secret`, e mande.

Não existe passo "pegar token" para lembrar: um script de pre-request emite o token quando não há
nenhum, renova um minuto antes de vencer, e reemite depois de um `401` — a mesma regra que os dois
clientes acima seguem. O **Issue an access token** existe só para ler de volta os escopos e o tempo
de vida que a credencial recebeu.

O **List completed meetings** e o **List completed calls** guardam o id do primeiro registro, então
as requisições abaixo deles funcionam sem copiar e colar, e guardam o `next_cursor` — mande a mesma
requisição de novo para ir à página seguinte. Todo filtro que a rota aceita está lá, desmarcado.
Quando uma requisição falha, o teste reporta o que dá para agir: `error.code`, o detalhe, e o
`request_id`.

Também roda headless, que foi como validamos:

```bash
cp postman/salesbud-api.postman_environment.json postman/mine.local.json
# preencha client_id e client_secret — `*.local.json` não é versionado

npx newman run postman/salesbud-api.postman_collection.json -e postman/mine.local.json
```

## Reuniões e ligações são coleções diferentes

Uma gravação capturada pelo bot fica em `/v1/meetings`, com id `mtg_`. Uma gravação capturada por
integração de VoIP fica em `/v1/calls`, com id `call_`. Mesmos campos, mesmas cinco rotas, coleções
separadas — um id não resolve na outra.

Não deduza o tipo pela mídia: `object` diz se é `meeting` ou `call`, `type` diz só `video` ou
`audio`, e os dois são independentes. Existem ligações em vídeo e reuniões em áudio. O
[guia](https://docs.salesbud.com.br/pt-br/guides/meetings-and-calls/) explica como um registro vira
uma ou outra.

## Tratando erros

Ramifique pelo `error.code`. Ele é estável entre versões; o `detail` é texto humano e pode ser
reescrito. O [guia de erros](https://docs.salesbud.com.br/pt-br/guides/errors/) lista todos os
códigos que a API devolve.

```js
try {
  await client.meeting("mtg_...");
} catch (error) {
  if (error.code === "RESOURCE_NOT_FOUND") { /* não existe, ou não é sua */ }
  if (error.code === "INSUFFICIENT_SCOPE") { /* falta escopo na credencial */ }
  throw error;
}
```

Todo erro carrega um `request_id`. Cite-o ao acionar o suporte — ele identifica a requisição exata
no nosso log.

## Licença

MIT. Copie estes arquivos para o seu projeto e mude o que precisar.
