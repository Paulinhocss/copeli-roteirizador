const postgres = require('../../infrastructure/postgres');

async function sincronizarPosicoes(payload) {
  const itens = Array.isArray(payload && payload.last_points)
    ? payload.last_points
    : [];

  if (!postgres.configurado()) {
    return { registros: 0, persistido: false };
  }

  let registros = 0;
  for (const item of itens) {
    const vehicle = item.vehicle || {};
    const driver = item.driver || {};
    const posicoes = Array.isArray(item.last_positions) ? item.last_positions : [];
    const conexoes = Array.isArray(item.last_connection) ? item.last_connection : [];
    const posicao = posicoes[0] || {};
    const conexao = conexoes[0] || {};

    const vehicleId = Number(
      vehicle.id || vehicle.vehicle_id || item.vehicle_id || 0
    );
    if (!Number.isFinite(vehicleId) || vehicleId <= 0) continue;

    await postgres.query(`
      INSERT INTO ct_contele_posicao_atual (
        contele_vehicle_id, vehicle_name, plate_number,
        driver_name, driver_code, lat, lng, ignition, speed,
        odometer, imei, rastreador_atualizado_em, sincronizado_em, payload
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),$13::jsonb
      )
      ON CONFLICT (contele_vehicle_id)
      DO UPDATE SET
        vehicle_name = EXCLUDED.vehicle_name,
        plate_number = EXCLUDED.plate_number,
        driver_name = EXCLUDED.driver_name,
        driver_code = EXCLUDED.driver_code,
        lat = EXCLUDED.lat,
        lng = EXCLUDED.lng,
        ignition = EXCLUDED.ignition,
        speed = EXCLUDED.speed,
        odometer = EXCLUDED.odometer,
        imei = EXCLUDED.imei,
        rastreador_atualizado_em = EXCLUDED.rastreador_atualizado_em,
        sincronizado_em = NOW(),
        payload = EXCLUDED.payload
    `, [
      vehicleId,
      vehicle.name || vehicle.vehicle_name || null,
      vehicle.plate_number || vehicle.plate || null,
      driver.name || null,
      driver.code || null,
      Number.isFinite(Number(posicao.lat)) ? Number(posicao.lat) : null,
      Number.isFinite(Number(posicao.lng)) ? Number(posicao.lng) : null,
      posicao.ignition === undefined ? null : Number(posicao.ignition),
      Number.isFinite(Number(posicao.speed)) ? Number(posicao.speed) : null,
      Number.isFinite(Number(posicao.odometer)) ? Number(posicao.odometer) : null,
      conexao.imei || null,
      conexao.last_updated || null,
      JSON.stringify(item),
    ]);
    registros += 1;
  }

  return { registros, persistido: true };
}

async function listarPosicoesCache() {
  const { rows } = await postgres.query(`
    SELECT
      contele_vehicle_id,
      vehicle_name,
      plate_number,
      driver_name,
      driver_code,
      lat::float8 AS lat,
      lng::float8 AS lng,
      ignition,
      speed::float8 AS speed,
      odometer::float8 AS odometer,
      imei,
      rastreador_atualizado_em,
      sincronizado_em
    FROM ct_contele_posicao_atual
    ORDER BY vehicle_name NULLS LAST, plate_number
  `);
  return rows;
}

module.exports = {
  sincronizarPosicoes,
  listarPosicoesCache,
};
