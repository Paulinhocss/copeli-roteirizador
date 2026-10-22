import { useEffect } from 'react';
import {
  CircleMarker,
  MapContainer,
  Popup,
  Polyline,
  TileLayer,
  useMap,
} from 'react-leaflet';
import type { Rota } from '../types';

function FitRoute({ rota }: { rota?: Rota | null }) {
  const map = useMap();

  useEffect(() => {
    if (!rota?.paradas?.length) return;
    const points = rota.paradas
      .map((p) => [
        Number(p.destino_operacional_lat ?? p.lat),
        Number(p.destino_operacional_lng ?? p.lng),
      ] as [number, number])
      .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));

    if (points.length) map.fitBounds(points, { padding: [48, 48] });
  }, [map, rota]);

  return null;
}

export function OperationsMap({ rota }: { rota?: Rota | null }) {
  const points = (rota?.paradas || [])
    .map((p) => ({
      parada: p,
      point: [
        Number(p.destino_operacional_lat ?? p.lat),
        Number(p.destino_operacional_lng ?? p.lng),
      ] as [number, number],
    }))
    .filter(({ point }) => Number.isFinite(point[0]) && Number.isFinite(point[1]));

  return (
    <MapContainer
      center={[-23.54689, -46.7631]}
      zoom={11}
      className="operations-map"
      scrollWheelZoom
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitRoute rota={rota} />
      {points.length > 1 && <Polyline positions={points.map((p) => p.point)} />}
      {points.map(({ parada, point }) => (
        <CircleMarker
          key={parada.id}
          center={point}
          radius={10}
          pathOptions={{ weight: 3 }}
        >
          <Popup>
            <strong>{parada.ordem_planejada}ª parada</strong><br />
            {parada.destino_operacional_nome || parada.cliente || 'Destino'}<br />
            {parada.modalidade} · {parada.quantidade_entregas} entrega(s)
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
