import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ControlTowerPage } from './pages/ControlTowerPage';
import { PlanejamentoPage } from './pages/PlanejamentoPage';
import { ConfiguracoesPage } from './pages/ConfiguracoesPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ControlTowerPage />} />
        <Route path="/planejamento" element={<PlanejamentoPage />} />
        <Route path="/configuracoes" element={<ConfiguracoesPage />} />
      </Route>
    </Routes>
  );
}
