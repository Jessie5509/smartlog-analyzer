DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM logs) THEN
        RAISE NOTICE 'La tabla logs ya tiene datos: se omite el seed.';
        RETURN;
    END IF;

    INSERT INTO logs (logged_at, service, level, message, metadata) VALUES
    ('2026-11-04T09:15:00Z', 'payments',  'INFO',  'Payment processed',                       '{"order_id": "A-1001"}'),
    ('2026-11-04T09:20:12Z', 'users',     'INFO',  'Login ok',                                '{"user_id": 42}'),
    ('2026-11-04T14:05:30Z', 'inventory', 'INFO',  'Stock updated',                           '{"sku": "SKU-77"}'),
    ('2026-11-04T18:40:00Z', 'shipping',  'INFO',  'Shipment created',                        '{"order_id": "A-1001"}'),

    ('2026-11-05T10:02:11Z', 'payments',  'INFO',  'Request received',                        '{"order_id": "A-2001"}'),
    ('2026-11-05T10:02:14Z', 'payments',  'ERROR', 'Timeout connecting to DB',                '{"order_id": "A-2001", "timeout_ms": 5000}'),
    ('2026-11-05T10:02:15Z', 'payments',  'ERROR', 'Timeout connecting to DB',                '{"order_id": "A-2002", "timeout_ms": 5000}'),
    ('2026-11-05T10:02:19Z', 'payments',  'ERROR', 'Connection pool exhausted',               '{"pool_size": 10}'),
    ('2026-11-05T10:15:03Z', 'payments',  'WARN',  'Slow query detected',                     '{"duration_ms": 2300}'),
    ('2026-11-05T10:15:40Z', 'payments',  'ERROR', 'Timeout connecting to DB',                '{"order_id": "A-2010", "timeout_ms": 5000}'),
    ('2026-11-05T10:30:00Z', 'payments',  'INFO',  'Payment processed',                       '{"order_id": "A-2011"}'),

    ('2026-11-05T11:00:01Z', 'users',     'INFO',  'Login ok',                                '{"user_id": 7}'),
    ('2026-11-05T11:05:10Z', 'users',     'WARN',  'Failed login attempt',                    '{"user_id": 99, "ip": "203.0.113.5"}'),
    ('2026-11-05T11:05:12Z', 'users',     'WARN',  'Failed login attempt',                    '{"user_id": 99, "ip": "203.0.113.5"}'),
    ('2026-11-05T11:05:14Z', 'users',     'WARN',  'Failed login attempt',                    '{"user_id": 99, "ip": "203.0.113.5"}'),
    ('2026-11-05T11:05:20Z', 'users',     'ERROR', 'Account locked after repeated failures', '{"user_id": 99}'),
    ('2026-11-05T11:30:45Z', 'users',     'ERROR', 'Token signature invalid',                 NULL),

    ('2026-11-05T12:00:00Z', 'shipping',  'INFO',  'Shipment created',                        '{"order_id": "A-2011"}'),
    ('2026-11-05T12:10:05Z', 'shipping',  'WARN',  'Carrier API slow',                        '{"duration_ms": 4100}'),
    ('2026-11-05T12:10:30Z', 'shipping',  'ERROR', 'Carrier API returned 503',                '{"carrier": "FastShip"}'),
    ('2026-11-05T12:11:02Z', 'shipping',  'ERROR', 'Carrier API returned 503',                '{"carrier": "FastShip"}'),
    ('2026-11-05T12:11:40Z', 'shipping',  'ERROR', 'Carrier API returned 503',                '{"carrier": "FastShip"}'),

    ('2026-11-05T13:00:00Z', 'inventory', 'DEBUG', 'Cache refreshed',                         NULL),
    ('2026-11-05T13:20:00Z', 'inventory', 'INFO',  'Stock updated',                           '{"sku": "SKU-12"}'),
    ('2026-11-05T13:45:00Z', 'inventory', 'WARN',  'Low stock',                               '{"sku": "SKU-12", "remaining": 3}');

    INSERT INTO analyses (id, status, log_count, summary, categories, suggestions, provider, completed_at)
    VALUES (
        '11111111-1111-1111-1111-111111111111',
        'completed',
        4,
        'El servicio payments tiene errores repetidos de conexión a la base de datos.',
        '[{"name": "database", "description": "Timeouts y pool de conexiones agotado"}]',
        '["Revisar el tamaño del pool de conexiones", "Investigar consultas lentas"]',
        'mock',
        now()
    );

    INSERT INTO analysis_logs (analysis_id, log_id)
    SELECT '11111111-1111-1111-1111-111111111111', id
    FROM logs
    WHERE service = 'payments' AND level = 'ERROR';
END $$;