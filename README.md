# SmartLog Analyzer

API interna para recibir logs de microservicios, guardarlos en PostgreSQL y usar un LLM para generar un resumen, categorizar los problemas y sugerir acciones.

- Diagrama y decisiones técnicas: [ARCHITECTURE.md](ARCHITECTURE.md)
- Stack: Node 22, TypeScript, Express, PostgreSQL 16, Zod, Vitest y Supertest.
- El LLM está detrás de una interfaz (`LLMClient`). Esta entrega incluye un **mock realista**; la integración con un proveedor real está documentada más abajo.

## 1. Requisitos y cómo levantar el proyecto

### Requisitos

- Docker Desktop (con Docker Compose v2).
- Para correr los tests o desarrollar sin Docker: Node 22 o superior.

No hace falta instalar PostgreSQL ni crear un `.env`: el proyecto tiene valores por defecto.

### Levantar todo

```bash
docker compose up --build -d
docker compose ps
```

Esto construye la app, levanta PostgreSQL, crea las tablas y carga datos de ejemplo (25 logs y un análisis). Cuando `db` y `app` figuren como `healthy`, la API está lista en `http://localhost:3000`.

Para apagar y borrar los datos:

```bash
docker compose down -v
```

### Probar la API

# Estado del servicio
Invoke-RestMethod http://localhost:3000/api/health

# Crear un log
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/logs -ContentType "application/json" -Body '{"timestamp":"2026-11-06T10:00:00Z","service":"payments","level":"ERROR","message":"Timeout connecting to DB"}'

# Listar logs con filtros y paginación
Invoke-RestMethod "http://localhost:3000/api/logs?service=payments&level=ERROR&limit=10"

# Pedir un análisis (ids de logs del seed)
$a = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/logs/analyze -ContentType "application/json" -Body '{"logIds":["6","7","8"]}'
$a

# Consultar el resultado (el análisis tarda un instante en completarse)
Start-Sleep 1
Invoke-RestMethod "http://localhost:3000/api/analysis/$($a.id)" | ConvertTo-Json -Depth 5

### Endpoints

| Método | Ruta | Descripción | Respuestas |
|---|---|---|---|
| POST | `/api/logs` | Ingesta un log | `201`, `400` |
| GET | `/api/logs` | Lista logs. Filtros: `service`, `level`, `from`, `to`. Paginación: `limit` (50 por defecto, máximo 200) y `offset` | `200`, `400` |
| POST | `/api/logs/analyze` | Pide un análisis de una lista de ids de logs (máximo 200). Responde de inmediato y procesa en segundo plano | `202`, `400`, `422` |
| GET | `/api/analysis/{id}` | Estado y resultado del análisis (`pending`, `completed` o `failed`) | `200`, `400`, `404` |
| GET | `/api/health` | Estado del servicio y de la base de datos | `200`, `503` |

Todos los errores usan el mismo formato:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request data", "details": [] } }
```

### Puertos, red y variables de entorno

La documentación completa está en la sección "Despliegue" de [ARCHITECTURE.md](ARCHITECTURE.md). En resumen:

- La API se publica en el puerto `3000` (configurable con `PORT`) y PostgreSQL en el `5432`.
- La app se conecta a la base por la red interna de Compose, con el host `db`.
- `.env.example` lista las variables. Ninguna es obligatoria para levantar con Docker.

### Desarrollo sin Docker para la app

```bash
cp .env.example .env
docker compose up -d db
npm install
npm run dev
```

## 2. Cómo correr los tests

Los tests de integración usan la base de PostgreSQL real, así que necesitan el contenedor `db` levantado. Usan una base separada (`smartlog_test`) que se recrea en cada corrida, por lo que no tocan los datos de desarrollo.

```bash
docker compose up -d db
npm install
npm test
```

- **Unitarios** (`tests/unit`): esquemas de validación y el mock del LLM, sin base de datos.
- **Integración** (`tests/integration`): la API completa con Supertest, incluidos filtros, paginación, errores de validación, un intento de inyección SQL y los casos del LLM: respuesta válida, formato inesperado, timeout y error del proveedor.

## 3. Cómo usé IA durante el desarrollo

Usé **Claude** como asistente durante todo el desafío. También le pedí que me ayudara a gestionar las tareas y a organizarme, mientras usaba **Notion** para ordenar ideas y anotar lo que tenía que documentar.

**En qué me ayudó**

- **Organización:** dividir el desafío en fases con tiempos estimados y llevar el orden de las tareas.
- **Setup inicial:** crear la estructura de carpetas desde la terminal para ahorrar tiempo, y armar la configuración base del proyecto (TypeScript, Express, `.gitignore`).
- **Diagramas:** solo conocía UML, así que le pedí que me explicara los tipos de diagramas de arquitectura y qué esperaba el desafío. Con eso elegí un único diagrama de componentes en Mermaid.
- **Base de datos:** consulté qué motor convenía para este prototipo y cómo modelar las tablas de logs y análisis.
- **Integración con el LLM:** es la parte donde más ayuda necesité. Nunca había integrado un LLM dentro de una aplicación: solo había usado Gemini como chatbot. Me ayudó a entender cómo se diseña (interfaz, mock, validación de la respuesta, timeout y estado del análisis) y me explicó cada pieza.
- **Docker:** la configuración del `Dockerfile` y del `docker-compose.yml`.
- **Tests:** la estructura de los tests unitarios y de integración, y los casos borde.

**Qué decidí no aceptar o cambiar**

- **Framework:** la primera propuesta fue Fastify. Elegí Express porque lo conozco mejor y puedo explicar cada línea.
- **Legibilidad del código:** la primera versión de `logsService.ts` armaba el SQL por partes y me resultó difícil de entender. Pedí una versión más simple, con una consulta fija, aunque aprovecha peor los índices con mucho volumen.
- **Query builder:** consideré usar Knex para no escribir SQL a mano y lo descarté, porque agregaba una dependencia y contradecía la decisión de usar `pg` directo.
- **Diagrama:** me propusieron dos (componentes y secuencia). Preferí un solo diagrama de componentes que incluyera Docker.
- **Seed:** pregunté qué pasaba si el seed se ejecutaba dos veces. Resultado: lo hice repetible, con una guardia que inserta solo si la tabla está vacía.

**Cómo verifiqué lo que escribió la IA**

- Leí y analicé cada fragmento de código antes de probarlo, y repregunté lo que no entendía.
- Probé cada endpoint a mano antes de escribir los tests.
- Corrí los tests y revisé qué casos borde cubren.

## 4. Qué dejé afuera y cómo lo resolvería

| Pendiente | Cómo lo resolvería |
|---|---|
| **Cola persistente de análisis.** El análisis corre en el mismo proceso: si el servidor se reinicia mientras hay uno `pending`, queda en ese estado para siempre. | Una cola con reintentos (por ejemplo BullMQ con Redis) y, al arrancar, retomar o marcar como `failed` los análisis pendientes viejos. |
| **El timeout no cancela la llamada al LLM**, solo deja de esperarla. | Pasar un `AbortSignal` al cliente HTTP del proveedor. |
| **Autenticación.** La API es abierta (herramienta interna, prototipo). | Una API key por servicio emisor o JWT, y límite de peticiones por cliente. |
| **Privacidad de los logs.** Un LLM externo recibiría los mensajes de los logs, que pueden contener datos sensibles. | Redactar datos sensibles antes de enviarlos, o usar un modelo local. |
| **Paginación por `offset`.** Rinde peor con millones de filas. | Paginación por cursor (por `logged_at` e `id`). |
| **Consulta con filtros opcionales fijos.** Es simple, pero puede aprovechar peor los índices con mucho volumen. | Armar el `WHERE` solo con los filtros recibidos. |
| **Migraciones.** Solo corren al crear la base por primera vez. | Una herramienta de migraciones versionadas que aplique solo las pendientes. |
| **Tests faltantes.** Base de datos caída en `/api/health` y concurrencia entre análisis simultáneos. | Un test que cierre el pool y verifique el `503`, y tests de carga. |
| **Extras opcionales:** CI, OpenAPI, logging estructurado, reverse proxy, Makefile. | CI con GitHub Actions (instalar, levantar la base y correr `npm test`) y logging estructurado en JSON como primeros pasos. |

### Cómo sería la integración real con un LLM

1. Crear una clase `AnthropicLLMClient` (o del proveedor elegido) que implemente `LLMClient`, en `src/llm/`.
2. Registrarla en `src/llm/index.ts` para `LLM_PROVIDER=anthropic`, leyendo la clave de `LLM_API_KEY`.
3. Enviar los logs en el prompt, pidiendo **solo JSON** con la forma `{ "summary", "categories": [{ "name", "description" }], "suggestions": [] }`, y llamar a la API del proveedor (en Anthropic, `POST https://api.anthropic.com/v1/messages` con los headers `x-api-key` y `anthropic-version`).
4. Devolver el texto parseado como `unknown`: `runAnalysis` ya lo valida con Zod, aplica el timeout y guarda `failed` si el formato es inesperado.
5. Los tests existentes con LLMs falsos siguen cubriendo la lógica, sin gastar dinero.

El resto del sistema no cambia, porque solo conoce la interfaz `LLMClient`.