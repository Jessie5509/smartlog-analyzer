# Arquitectura

## Diagrama

```mermaid
flowchart LR
    C["Cliente / microservicios"]

    subgraph Docker["Docker Compose (red interna)"]
        subgraph App["Contenedor app: Node + Express :3000"]
            R["Rutas y validación (Zod)"]
            S["Servicios"]
            L["LLMClient"]
        end
        D[("PostgreSQL :5432")]
    end

    X{{"Proveedor LLM (mock o real)"}}

    C -->|"1. HTTP / JSON"| R
    R --> S
    S -->|"2. SQL: logs y análisis"| D
    S --> L
    L -->|"3. prompt con timeout"| X
```

## Flujo de datos

1. Los servicios envían logs con `POST /api/logs`. Se validan y se guardan en PostgreSQL.
2. `GET /api/logs` lista los logs con filtros (servicio, nivel, rango de fechas) y paginación.
3. `POST /api/logs/analyze` recibe un filtro o un conjunto de ids, crea un análisis en estado `pending` y responde `202` con su id.
4. En segundo plano, el servicio carga los logs, llama al LLM con un timeout, valida la respuesta y guarda el resultado (`completed` o `failed`).
5. `GET /api/analysis/{id}` devuelve el estado y el resultado.

## Decisiones técnicas

| Decisión | Elegí | Descarté | Por qué |
|---|---|---|---|
| Framework | Express | Fastify | Lo conozco mejor; la ventaja de rendimiento de Fastify no justifica aprender otra herramienta en un prototipo. |
| Lenguaje | TypeScript | JavaScript | Tipos para modelar logs y respuestas del LLM, menos errores. |
| Base de datos | PostgreSQL | MongoDB, SQLite | Los logs tienen estructura fija y necesito consultas de agregación e índices; SQLite complica el despliegue con Docker. |
| Acceso a datos | `pg` con SQL | ORM (Prisma, TypeORM) | Control total de las agregaciones y menos dependencias. |
| Validación | Zod | Validación manual | Esquemas reutilizables que también dan los tipos de TypeScript. |
| Análisis | Asincrónico (202 + consulta por id) | Sincrónico | El LLM puede tardar o fallar; no conviene bloquear la petición. |
| LLM | Interfaz `LLMClient` con mock | Acoplarse a un proveedor | Permite testear sin costo y cambiar de proveedor sin tocar la lógica. |
| Migraciones | Scripts SQL versionados | Herramienta de migraciones | Simple y fácil de revisar. |
| Despliegue | Docker Compose (app + db) | Instalación manual | Se levanta con un solo comando. |

## Modelo de datos

| Decisión | Elegí | Descarté | Por qué |
|---|---|---|---|
| Validación del nivel | `CHECK` en la base, además de Zod | Validar solo en la app | La base rechaza niveles inválidos aunque alguien inserte sin pasar por la API. |
| Fechas del log | `logged_at` (cuándo ocurrió) y `created_at` (cuándo llegó) | Un solo timestamp | Pueden diferir por demoras de red, y las consultas por rango usan `logged_at`. |
| Datos extra del log | `metadata` en JSONB | Columnas fijas o tabla clave-valor | Cada microservicio manda datos distintos (request id, usuario) sin cambiar el esquema. |
| Resultado del LLM | `categories` y `suggestions` en JSONB dentro de `analyses` | Tablas normalizadas | Tienen estructura variable y no se consultan por separado; normalizar sería sobreingeniería en un prototipo. |
| Logs de un análisis | Tabla intermedia `analysis_logs` | Array de ids en `analyses` | Mantiene la integridad referencial y permite consultar en ambos sentidos. |
| Identificadores | `BIGSERIAL` en `logs`, UUID en `analyses` | Enteros o UUID en todas las tablas | Los logs son muchos y se insertan seguido; el id del análisis se expone en la API y no debe ser adivinable. |
| Estado del análisis | `status` con `pending`, `completed` y `failed` | Booleano de terminado | Soporta el análisis asincrónico y distingue una falla de un análisis en curso. |
| Índices | Compuestos `(service, logged_at)` y `(level, logged_at)` | Sin índices o uno por columna | Cubren los filtros de `GET /api/logs` y las agregaciones por rango de fechas. |  |     |
| Seed repetible | Bloque `DO` que inserta solo si `logs` está vacía | Seed sin guardia o `TRUNCATE` previo | Correrlo dos veces no duplica datos ni pisa logs reales. |

## Supuestos

- Los logs llegan de a uno (`POST /api/logs`); el tamaño máximo de un análisis es de N logs para acotar el prompt.
- No hay autenticación (es una herramienta interna de prototipo).

## Limitaciones conocidas
