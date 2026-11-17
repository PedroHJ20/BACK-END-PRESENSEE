import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function isPresenteOuAbonado(status: string): boolean {
  return status === 'PRESENT' || status === 'EXCUSED';
}

function extrairFichaCadastro(incidents: Array<{ type: string; description: string }>) {
  const ficha = incidents.find((i) => i.type === 'FICHA_CADASTRO');
  if (!ficha?.description) return {};
  try {
    return JSON.parse(ficha.description);
  } catch {
    return {};
  }
}

export class ChatController {
  static async ask(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Usuário não autenticado.' });
      }

      const { mensagem, historico } = req.body;
      if (!mensagem || !String(mensagem).trim()) {
        return res.status(400).json({ error: 'A mensagem é obrigatória.' });
      }

      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          error: 'Chave GROQ_API_KEY não configurada no servidor.',
        });
      }

      const filtroEscola =
        user.role !== 'ADMIN' && user.escolaId ? { escolaId: user.escolaId } : {};

      const filtroAttendance =
        user.role !== 'ADMIN' && user.escolaId
          ? { student: { escolaId: user.escolaId } }
          : {};

      // Consultas resilientes no NeonDB via Prisma (cada tabela isolada para nunca quebrar a rota)
      const [escolaInfo, students, classes, attendances, events, incidents] = await Promise.all([
        user.escolaId
          ? (prisma as any).escola
              ?.findUnique({
                where: { id: user.escolaId },
                select: { nome: true, cidade: true, estado: true },
              })
              .catch(() => null)
          : Promise.resolve(null),
        prisma.student
          .findMany({
            where: filtroEscola,
            include: { class: true },
          })
          .catch((err) => {
            console.error('Erro Prisma student:', err);
            return [];
          }),
        prisma.class
          .findMany({
            where: filtroEscola,
          })
          .catch((err) => {
            console.error('Erro Prisma class:', err);
            return [];
          }),
        prisma.attendance
          .findMany({
            where: filtroAttendance,
          })
          .catch((err) => {
            console.error('Erro Prisma attendance:', err);
            return [];
          }),
        prisma.event
          .findMany({
            where: filtroEscola,
            orderBy: { startDate: 'desc' },
          })
          .catch((err) => {
            console.error('Erro Prisma event:', err);
            return [];
          }),
        prisma.incident
          .findMany({
            where: filtroEscola,
            orderBy: { date: 'desc' },
          })
          .catch((err) => {
            console.error('Erro Prisma incident:', err);
            return [];
          }),
      ]);

      // Agrupa chamadas e incidentes por studentId em memória
      const chamadasPorAluno = new Map<string, any[]>();
      attendances.forEach((a: any) => {
        const sid = String(a.studentId);
        if (!chamadasPorAluno.has(sid)) chamadasPorAluno.set(sid, []);
        chamadasPorAluno.get(sid)!.push(a);
      });

      const incidentesPorAluno = new Map<string, any[]>();
      incidents.forEach((inc: any) => {
        if (!inc.studentId) return;
        const sid = String(inc.studentId);
        if (!incidentesPorAluno.has(sid)) incidentesPorAluno.set(sid, []);
        incidentesPorAluno.get(sid)!.push(inc);
      });

      const mapaAlunosNome = new Map<string, string>();
      students.forEach((s: any) => mapaAlunosNome.set(String(s.id), s.name));

      // Consolida dados reais de cada aluno no NeonDB
      const resumoAlunos = students.map((s: any) => {
        const sid = String(s.id);
        const chamadasAluno = chamadasPorAluno.get(sid) || [];
        const incidentesAluno = incidentesPorAluno.get(sid) || [];

        const totalChamadas = chamadasAluno.length;
        const presencas = chamadasAluno.filter((a: any) => isPresenteOuAbonado(a.status)).length;
        const faltasNaoJustificadas = chamadasAluno.filter((a: any) => a.status === 'ABSENT').length;
        const justificadas = chamadasAluno.filter((a: any) => a.status === 'EXCUSED').length;
        const frequencia = totalChamadas > 0 ? Math.round((presencas / totalChamadas) * 100) : 100;
        const risco = frequencia < 75 ? 'Alto' : frequencia < 90 ? 'Médio' : 'Baixo';

        const ficha = extrairFichaCadastro(incidentesAluno);
        const ocorrenciasVisiveis = incidentesAluno.filter(
          (i: any) =>
            !['FICHA_CADASTRO', 'CONFIG_HORARIO_AULA', 'PENDENCIA', 'RESOLVIDO'].includes(i.type)
        );
        const pendenciasAbertas = incidentesAluno.filter((i: any) => i.type === 'PENDENCIA');

        return {
          nome: s.name,
          matricula: s.registration,
          turma: s.class?.name || 'Sem turma',
          modalidade: s.class?.course || '',
          turno: s.class?.shift || '',
          sexo: ficha.gender || null,
          bairro: ficha.bairro || null,
          cidade: ficha.cidade || null,
          estado: ficha.estado || null,
          frequencia,
          risco,
          totalChamadas,
          presencasEfetivas: presencas,
          faltasNaoJustificadas,
          justificadas,
          totalOcorrencias: ocorrenciasVisiveis.length,
          pendenciasAbertas: pendenciasAbertas.length,
        };
      });

      // Consolida dados reais por turma
      const resumoTurmas = classes.map((c: any) => {
        const alunosDaTurma = students.filter((s: any) => String(s.classId) === String(c.id));
        let total = 0;
        let presentes = 0;
        alunosDaTurma.forEach((st: any) => {
          const chamadasSt = chamadasPorAluno.get(String(st.id)) || [];
          total += chamadasSt.length;
          presentes += chamadasSt.filter((a: any) => isPresenteOuAbonado(a.status)).length;
        });
        return {
          turma: c.name,
          modalidade: c.course || '',
          turno: c.shift || '',
          ano: c.year || null,
          totalAlunos: alunosDaTurma.length,
          frequenciaMedia: total > 0 ? Math.round((presentes / total) * 100) : 100,
        };
      });

      const ocorrenciasGerais = incidents
        .filter((inc: any) => !['FICHA_CADASTRO', 'CONFIG_HORARIO_AULA'].includes(inc.type))
        .slice(0, 40)
        .map((inc: any) => ({
          aluno: inc.studentId ? mapaAlunosNome.get(String(inc.studentId)) || 'Aluno' : 'Geral',
          tipo: inc.type,
          data: inc.date ? new Date(inc.date).toISOString().split('T')[0] : null,
          resolvida: inc.type === 'RESOLVIDO',
        }));

      const contextoBancoReal = {
        fonte: 'Banco de dados real PostgreSQL (NeonDB)',
        escola: escolaInfo || 'Instituição PresenSee',
        totalAlunos: resumoAlunos.length,
        distribuicaoRisco: {
          Baixo: resumoAlunos.filter((a: any) => a.risco === 'Baixo').length,
          Medio: resumoAlunos.filter((a: any) => a.risco === 'Médio').length,
          Alto: resumoAlunos.filter((a: any) => a.risco === 'Alto').length,
        },
        turmas: resumoTurmas,
        alunos: resumoAlunos,
        eventosEscolares: events.map((e: any) => ({
          titulo: e.title,
          tipo: e.type,
          abonaFalta: e.excusesAbsence,
          publico: e.audience,
          inicio: e.startDate ? new Date(e.startDate).toISOString().split('T')[0] : null,
          fim: e.endDate ? new Date(e.endDate).toISOString().split('T')[0] : null,
        })),
        ocorrenciasRegistradas: ocorrenciasGerais,
      };

      const systemPrompt = `Você é o Assistente Oficial do PresenSee.
REGRA INVIOLÁVEL: Você deve responder UTILIZANDO EXCLUSIVAMENTE OS DADOS DO BANCO DE DADOS REAL (NeonDB) fornecidos no JSON abaixo.
É TERMINANTEMENTE PROIBIDO inventar, estimar, supor ou completar informações que não estejam explicitamente presentes nos dados abaixo. Se o usuário apenas cumprimentar (ex: "oi", "olá"), responda cordialmente apresentando um breve resumo real da escola (ex: total de alunos e turmas cadastradas) e perguntando como pode ajudar.
Se um dado solicitado não existir ou estiver vazio/null no banco (por exemplo, nenhuma nota lançada ou nenhum bairro preenchido), informe claramente ao usuário que ainda não há registros desse dado no banco de dados.

REGRAS DE CÁLCULO DO PRESENSEE:
1. Faltas justificadas/abonadas (atestados ou eventos com abono) contam como presença válida no cálculo da frequência.
2. Classificação de risco: Frequência >= 90% = "Baixo", entre 75% e 89% = "Médio", < 75% = "Alto".

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON válido):
{
  "texto": "Resposta objetiva em português do Brasil baseada apenas nos registros reais do banco.",
  "grafico": null
}

REGRAS PARA GRÁFICOS:
- Preencha "grafico" apenas quando o usuário pedir um gráfico/comparação/distribuição E houver dados reais no JSON abaixo para construí-lo:
{
  "titulo": "Título objetivo",
  "subtitulo": "Subtítulo descritivo",
  "tipo": "colunas" | "barras" | "linha" | "area" | "pizza" | "dispersao",
  "eixoX": "Nome do eixo X (para dispersao)",
  "eixoY": "Nome do eixo Y (para dispersao)",
  "dados": [
    { "nome": "Rótulo Real", "valor": 100 }
  ]
}
- Para gráficos de dispersão ("dispersao"), cada item em "dados" deve ter { "x": numero, "y": numero, "nome": "Nome Real" }.
- Se não houver registros reais suficientes para gerar o gráfico pedido, retorne "grafico": null e explique no "texto" o que falta cadastrar no sistema.

DADOS REAIS EXTRAÍDOS DO NEONDB:
${JSON.stringify(contextoBancoReal)}`;

      const mensagensChat: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
        { role: 'system', content: systemPrompt },
      ];

      if (Array.isArray(historico)) {
        historico.slice(-6).forEach((msg: any) => {
          if (msg?.texto && (msg.autor === 'user' || msg.autor === 'ia')) {
            mensagensChat.push({
              role: msg.autor === 'user' ? 'user' : 'assistant',
              content: String(msg.texto),
            });
          }
        });
      }

      mensagensChat.push({ role: 'user', content: String(mensagem).trim() });

      const groqResponse = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: mensagensChat,
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      });

      if (!groqResponse.ok) {
        const errText = await groqResponse.text();
        console.error('Erro na Groq API:', groqResponse.status, errText);
        return res.status(502).json({
          error: `Falha na Groq API (${groqResponse.status}). Verifique a chave GROQ_API_KEY.`,
        });
      }

      const completion = (await groqResponse.json()) as any;
      const rawContent = completion?.choices?.[0]?.message?.content || '{}';

      let parsed: { texto?: string; grafico?: any } = {};
      try {
        parsed = JSON.parse(rawContent);
      } catch {
        parsed = { texto: rawContent, grafico: null };
      }

      const tiposValidos = ['linha', 'barras', 'area', 'dispersao', 'pizza', 'colunas'];
      const graficoValido =
        parsed.grafico &&
        typeof parsed.grafico === 'object' &&
        tiposValidos.includes(parsed.grafico.tipo) &&
        Array.isArray(parsed.grafico.dados) &&
        parsed.grafico.dados.length > 0
          ? parsed.grafico
          : null;

      return res.json({
        texto: parsed.texto || 'Consulta concluída.',
        grafico: graficoValido,
      });
    } catch (error: any) {
      console.error('Erro no ChatController:', error);
      return res.status(500).json({
        error: `Erro interno ao processar o assistente: ${error?.message || 'desconhecido'}`,
      });
    }
  }
}