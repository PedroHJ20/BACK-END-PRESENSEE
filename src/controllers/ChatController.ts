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

      // Consulta diretamente o banco de dados real no NeonDB via Prisma
      const [escolaInfo, students, classes, events, incidents] = await Promise.all([
        user.escolaId
          ? prisma.escola.findUnique({
              where: { id: user.escolaId },
              select: { nome: true, cidade: true, estado: true },
            })
          : Promise.resolve(null),
        prisma.student.findMany({
          where: filtroEscola,
          include: {
            class: true,
            attendances: true,
            grades: true,
            incidents: true,
            alerts: { where: { status: 'PENDING' } },
          },
        }),
        prisma.class.findMany({
          where: filtroEscola,
          include: {
            students: {
              include: { attendances: true },
            },
          },
        }),
        prisma.event.findMany({
          where: filtroEscola,
          orderBy: { startDate: 'desc' },
        }),
        prisma.incident.findMany({
          where: {
            ...filtroEscola,
            NOT: { type: { in: ['FICHA_CADASTRO', 'CONFIG_HORARIO_AULA'] } },
          },
          include: {
            student: { select: { name: true, registration: true } },
          },
          orderBy: { date: 'desc' },
        }),
      ]);

      // Consolida todos os dados reais dos estudantes (frequência, risco, notas, bairro/cidade, ocorrências)
      const resumoAlunos = students.map((s) => {
        const totalChamadas = s.attendances.length;
        const presencas = s.attendances.filter((a) => isPresenteOuAbonado(a.status)).length;
        const faltasNaoJustificadas = s.attendances.filter((a) => a.status === 'ABSENT').length;
        const justificadas = s.attendances.filter((a) => a.status === 'EXCUSED').length;
        const frequencia = totalChamadas > 0 ? Math.round((presencas / totalChamadas) * 100) : 100;
        const risco = frequencia < 75 ? 'Alto' : frequencia < 90 ? 'Médio' : 'Baixo';

        const mediaNotas =
          s.grades.length > 0
            ? Number(
                (s.grades.reduce((acc, g) => acc + g.value, 0) / s.grades.length).toFixed(1)
              )
            : null;

        const ficha = extrairFichaCadastro(s.incidents);
        const ocorrenciasVisiveis = s.incidents.filter(
          (i) => !['FICHA_CADASTRO', 'CONFIG_HORARIO_AULA', 'PENDENCIA', 'RESOLVIDO'].includes(i.type)
        );
        const pendenciasAbertas = s.incidents.filter((i) => i.type === 'PENDENCIA');

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
          mediaNotas,
          totalOcorrencias: ocorrenciasVisiveis.length,
          pendenciasAbertas: pendenciasAbertas.length,
          alertasPendentes: s.alerts.length,
        };
      });

      const resumoTurmas = classes.map((c) => {
        let total = 0;
        let presentes = 0;
        c.students.forEach((st) => {
          total += st.attendances.length;
          presentes += st.attendances.filter((a) => isPresenteOuAbonado(a.status)).length;
        });
        return {
          turma: c.name,
          modalidade: c.course,
          turno: c.shift,
          ano: c.year,
          totalAlunos: c.students.length,
          frequenciaMedia: total > 0 ? Math.round((presentes / total) * 100) : 100,
        };
      });

      const contextoBancoReal = {
        fonte: 'Banco de dados real PostgreSQL (NeonDB)',
        escola: escolaInfo || 'Visão Global (Administrador)',
        totalAlunos: resumoAlunos.length,
        distribuicaoRisco: {
          Baixo: resumoAlunos.filter((a) => a.risco === 'Baixo').length,
          Medio: resumoAlunos.filter((a) => a.risco === 'Médio').length,
          Alto: resumoAlunos.filter((a) => a.risco === 'Alto').length,
        },
        turmas: resumoTurmas,
        alunos: resumoAlunos,
        eventosEscolares: events.map((e) => ({
          titulo: e.title,
          tipo: e.type,
          abonaFalta: e.excusesAbsence,
          publico: e.audience,
          inicio: e.startDate.toISOString().split('T')[0],
          fim: e.endDate.toISOString().split('T')[0],
        })),
        ocorrenciasRegistradas: incidents.slice(0, 40).map((inc) => ({
          aluno: inc.student?.name || 'Geral',
          tipo: inc.type,
          data: inc.date.toISOString().split('T')[0],
          resolvida: inc.type === 'RESOLVIDO',
        })),
      };

      const systemPrompt = `Você é o Assistente Oficial do PresenSee.
REGRA INVIOLÁVEL: Você deve responder UTILIZANDO EXCLUSIVAMENTE OS DADOS DO BANCO DE DADOS REAL (NeonDB) fornecidos no JSON abaixo.
É TERMINANTEMENTE PROIBIDO inventar, estimar, supor ou completar informações que não estejam explicitamente presentes nos dados abaixo. Se um dado solicitado não existir ou estiver vazio/null no banco (por exemplo, nenhuma nota lançada ou nenhum bairro preenchido), informe claramente ao usuário que ainda não há registros desse dado no banco de dados.

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
          error: 'Falha ao consultar o serviço de IA da Groq.',
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
    } catch (error) {
      console.error('Erro no ChatController:', error);
      return res.status(500).json({ error: 'Erro interno ao processar o assistente.' });
    }
  }
}