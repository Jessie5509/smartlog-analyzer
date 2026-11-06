-- 1. Cantidad de logs por servicio y nivel en un rango de fechas
--    $1 = fecha desde (inclusive), $2 = fecha hasta (exclusiva)
SELECT service, level, COUNT(*) AS total
FROM logs
WHERE logged_at >= $1 AND logged_at < $2
GROUP BY service, level
ORDER BY service, total DESC;

-- 2. Errores que se repiten (candidatos a patrón)
SELECT service, message, COUNT(*) AS occurrences,
       MIN(logged_at) AS first_seen,
       MAX(logged_at) AS last_seen
FROM logs
WHERE level = 'ERROR'
GROUP BY service, message
HAVING COUNT(*) > 1
ORDER BY occurrences DESC;