import { Routes, Route } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/pages/Dashboard';
import { Clientes } from '@/pages/Clientes';
import { ClienteDetalhe } from '@/pages/ClienteDetalhe';
import { Emprestimos } from '@/pages/Emprestimos';
import { EmprestimoDetalhe } from '@/pages/EmprestimoDetalhe';
import { Pagamentos } from '@/pages/Pagamentos';
import { Extrato } from '@/pages/Extrato';
import { Cobrancas } from '@/pages/Cobrancas';
import { ReporteBdm } from '@/pages/ReporteBdm';
import { Simulador } from '@/pages/Simulador';
import { Financas } from '@/pages/Financas';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/clientes/:id" element={<ClienteDetalhe />} />
        <Route path="/emprestimos" element={<Emprestimos />} />
        <Route path="/emprestimos/:id" element={<EmprestimoDetalhe />} />
        <Route path="/pagamentos" element={<Pagamentos />} />
        <Route path="/extrato" element={<Extrato />} />
        <Route path="/cobrancas" element={<Cobrancas />} />
        <Route path="/reporte-bdm" element={<ReporteBdm />} />
        <Route path="/simulador" element={<Simulador />} />
        <Route path="/financas" element={<Financas />} />
      </Route>
    </Routes>
  );
}
