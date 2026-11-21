import * as React from 'react';
import { Input, Label, Select } from '@/components/ui/primitives';
import { garantiaExigida } from '@/lib/simulador';
import type { DadosContrato, MeioDesembolso, TipoGarantia } from '@/lib/contrato';

interface Props {
  value: DadosContrato;
  onChange: (v: DadosContrato) => void;
  capital?: number;
}

function Grupo({ titulo, children, aberto = false }: { titulo: string; children: React.ReactNode; aberto?: boolean }) {
  return (
    <details open={aberto} className="rounded-lg border border-ink-100 dark:border-ink-700 px-3 py-2 group">
      <summary className="cursor-pointer text-sm font-semibold select-none text-ink-700 dark:text-parchment-100">{titulo}</summary>
      <div className="grid grid-cols-2 gap-3 pt-3 pb-1">{children}</div>
    </details>
  );
}

function Campo({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : undefined}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Formulário dos dados do contrato de mútuo. Os campos que já existem na
 * ficha do cliente vêm preenchidos, mas são gravados só no contrato. */
export function ContratoForm({ value, onChange, capital }: Props) {
  const m = value.mutuario;
  const f = value.fiador;
  const c = value.credito;
  const t = value.testemunhas ?? {};
  const setM = (k: keyof DadosContrato['mutuario'], x: string) => onChange({ ...value, mutuario: { ...m, [k]: x } });
  const setF = (k: keyof DadosContrato['fiador'], x: string) => onChange({ ...value, fiador: { ...f, [k]: x } });
  const setC = <K extends keyof DadosContrato['credito']>(k: K, x: DadosContrato['credito'][K]) => onChange({ ...value, credito: { ...c, [k]: x } });
  const setT = (k: string, x: string) => onChange({ ...value, testemunhas: { ...t, [k]: x } });
  const g = capital ? garantiaExigida(capital) : null;

  return (
    <div className="space-y-2">
      <Grupo titulo="Condições do crédito" aberto>
        <Campo label="Finalidade do crédito" full>
          <Input value={c.finalidade ?? ''} onChange={(e) => setC('finalidade', e.target.value)} placeholder="ex.: reforço de stock do negócio" />
        </Campo>
        <Campo label="Prazo (dias)">
          <Input type="number" min={1} max={180} value={c.prazo_dias} onChange={(e) => setC('prazo_dias', parseInt(e.target.value || '0', 10))} />
        </Campo>
        <Campo label="N.º de prestações">
          <Select value={c.n_prestacoes} onChange={(e) => setC('n_prestacoes', parseInt(e.target.value, 10))}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Campo>
        <Campo label="Meio de desembolso">
          <Select value={c.meio} onChange={(e) => setC('meio', e.target.value as MeioDesembolso)}>
            <option value="numerario">Numerário</option>
            <option value="transferencia">Transferência</option>
            <option value="carteira">Carteira móvel</option>
          </Select>
        </Campo>
        <Campo label="Comissão de abertura (%)">
          <Input type="number" min={0} step="0.1" value={c.comissao_pct ?? 0} onChange={(e) => setC('comissao_pct', parseFloat(e.target.value || '0'))} />
        </Campo>
        <Campo label="Garantia prestada">
          <Select value={c.garantia} onChange={(e) => setC('garantia', e.target.value as TipoGarantia)}>
            <option value="sem">Sem garantia real</option>
            <option value="fianca">Fiança / Aval</option>
            <option value="penhor">Penhor de bem móvel</option>
            <option value="viatura">Viatura</option>
            <option value="outra">Outra</option>
          </Select>
        </Campo>
        {c.garantia === 'outra' ? (
          <Campo label="Qual garantia?">
            <Input value={c.garantia_outra ?? ''} onChange={(e) => setC('garantia_outra', e.target.value)} />
          </Campo>
        ) : <div />}
        {g && (
          <p className="col-span-2 text-xs text-ink-500 dark:text-parchment-200/60">
            Cláusula 7.1 — {g.nivel}: <strong>{g.texto}</strong>
          </p>
        )}
      </Grupo>

      <Grupo titulo="Mutuário — dados para o contrato">
        <Campo label="Data de nascimento"><Input type="date" value={m.nascimento ?? ''} onChange={(e) => setM('nascimento', e.target.value)} /></Campo>
        <Campo label="Naturalidade"><Input value={m.naturalidade ?? ''} onChange={(e) => setM('naturalidade', e.target.value)} /></Campo>
        <Campo label="Documento (B.I./Passaporte)"><Input value={m.documento ?? ''} onChange={(e) => setM('documento', e.target.value)} /></Campo>
        <Campo label="NUIT"><Input value={m.nuit ?? ''} onChange={(e) => setM('nuit', e.target.value)} /></Campo>
        <Campo label="Documento emitido em (local)"><Input value={m.doc_local ?? ''} onChange={(e) => setM('doc_local', e.target.value)} /></Campo>
        <Campo label="Data de emissão"><Input type="date" value={m.doc_data ?? ''} onChange={(e) => setM('doc_data', e.target.value)} /></Campo>
        <Campo label="Bairro"><Input value={m.bairro ?? ''} onChange={(e) => setM('bairro', e.target.value)} /></Campo>
        <Campo label="Cidade"><Input value={m.cidade ?? ''} onChange={(e) => setM('cidade', e.target.value)} /></Campo>
        <Campo label="Quarteirão"><Input value={m.quarteirao ?? ''} onChange={(e) => setM('quarteirao', e.target.value)} /></Campo>
        <Campo label="Casa n.º"><Input value={m.casa ?? ''} onChange={(e) => setM('casa', e.target.value)} /></Campo>
        <Campo label="Telefone"><Input value={m.telefone ?? ''} onChange={(e) => setM('telefone', e.target.value)} /></Campo>
        <Campo label="E-mail"><Input value={m.email ?? ''} onChange={(e) => setM('email', e.target.value)} /></Campo>
        <Campo label="Profissão / Entidade empregadora" full><Input value={m.profissao ?? ''} onChange={(e) => setM('profissao', e.target.value)} /></Campo>
        {m.morada && !m.bairro && (
          <p className="col-span-2 text-xs text-ink-500">Morada na ficha do cliente: <strong>{m.morada}</strong> — usada no contrato se não preencher bairro/cidade.</p>
        )}
      </Grupo>

      <Grupo titulo="Fiador / Avalista">
        <Campo label="Nome completo" full><Input value={f.nome ?? ''} onChange={(e) => setF('nome', e.target.value)} /></Campo>
        <Campo label="Documento (B.I./Passaporte)"><Input value={f.documento ?? ''} onChange={(e) => setF('documento', e.target.value)} /></Campo>
        <Campo label="Relação com o Mutuário"><Input value={f.relacao ?? ''} onChange={(e) => setF('relacao', e.target.value)} /></Campo>
        <Campo label="Documento emitido em (local)"><Input value={f.doc_local ?? ''} onChange={(e) => setF('doc_local', e.target.value)} /></Campo>
        <Campo label="Data de emissão"><Input type="date" value={f.doc_data ?? ''} onChange={(e) => setF('doc_data', e.target.value)} /></Campo>
        <Campo label="Morada / Telefone" full><Input value={f.morada_telefone ?? ''} onChange={(e) => setF('morada_telefone', e.target.value)} /></Campo>
      </Grupo>

      <Grupo titulo="Testemunhas (opcional)">
        <Campo label="Testemunha 1 — nome"><Input value={t.t1_nome ?? ''} onChange={(e) => setT('t1_nome', e.target.value)} /></Campo>
        <Campo label="Testemunha 1 — B.I."><Input value={t.t1_bi ?? ''} onChange={(e) => setT('t1_bi', e.target.value)} /></Campo>
        <Campo label="Testemunha 2 — nome"><Input value={t.t2_nome ?? ''} onChange={(e) => setT('t2_nome', e.target.value)} /></Campo>
        <Campo label="Testemunha 2 — B.I."><Input value={t.t2_bi ?? ''} onChange={(e) => setT('t2_bi', e.target.value)} /></Campo>
      </Grupo>
    </div>
  );
}

/** Pré-preenche o contrato com o que já existe na ficha do cliente (só leitura). */
export function contratoDoCliente(
  base: DadosContrato,
  cliente: { nome_completo: string; documento: string | null; contacto: string | null; morada: string | null; fiador_nome: string | null; fiador_contacto: string | null; fiador_documento: string | null } | undefined,
): DadosContrato {
  if (!cliente) return base;
  return {
    ...base,
    mutuario: {
      ...base.mutuario,
      nome: cliente.nome_completo,
      documento: base.mutuario.documento || cliente.documento || '',
      telefone: base.mutuario.telefone || cliente.contacto || '',
      morada: cliente.morada || base.mutuario.morada || '',
    },
    fiador: {
      ...base.fiador,
      nome: base.fiador.nome || cliente.fiador_nome || '',
      documento: base.fiador.documento || cliente.fiador_documento || '',
      morada_telefone: base.fiador.morada_telefone || cliente.fiador_contacto || '',
    },
  };
}
