CREATE TABLE logs (
    id          BIGSERIAL PRIMARY KEY,
    logged_at   TIMESTAMPTZ  NOT NULL,
    service     VARCHAR(100) NOT NULL,
    level       VARCHAR(10)  NOT NULL
                CHECK (level IN ('DEBUG', 'INFO', 'WARN', 'ERROR')),
    message     TEXT         NOT NULL,
    metadata    JSONB,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_logs_logged_at ON logs (logged_at);
CREATE INDEX idx_logs_service_logged_at ON logs (service, logged_at);
CREATE INDEX idx_logs_level_logged_at ON logs (level, logged_at);

CREATE TABLE analyses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status        VARCHAR(10) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'completed', 'failed')),
    log_count     INTEGER     NOT NULL,
    summary       TEXT,
    categories    JSONB,
    suggestions   JSONB,
    error         TEXT,
    provider      VARCHAR(50),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ
);

CREATE TABLE analysis_logs (
    analysis_id  UUID   NOT NULL REFERENCES analyses (id) ON DELETE CASCADE,
    log_id       BIGINT NOT NULL REFERENCES logs (id) ON DELETE CASCADE,
    PRIMARY KEY (analysis_id, log_id)
);

CREATE INDEX idx_analysis_logs_log_id ON analysis_logs (log_id);