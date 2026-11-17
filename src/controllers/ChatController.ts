import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function isPresenteOuAbonado(status: string): boolean {
  return status === 'PRESENT' || status === 'EXCUSED';
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

      // Coleta dados reais da instituição no banco para embasar respostas e gráficos
      const [students, classes, events, incidents] = await Promise.all([
        prisma.student.findMany({
          where: filtroEscola,
          include: {
            class: true,
            attendances: true,
            grades: true,
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
          take: 15,
        }),
        prisma.incident.findMany({
          where: {
            ...filtroEscola,
            NOT: { type: { in: ['FICHA_CADASTRO', 'CONFIG_HORARIO_AULA'] } },
          },
          orderBy: { date: 'desc' },
          take: 25,
        }),
      ]);

      // Resume alunos com frequência real (PRESENT + EXCUSED = presença) e média de notas
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

        return {
          nome: s.name,
          matricula: s.registration,
          turma: s.class?.name || 'Sem turma',
          modalidade: s.class?.course || '',
          turno: s.class?.shift || '',
          frequencia,
          risco,
          faltasNaoJustificadas,
          justificadas,
          mediaNotas,
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
          totalAlunos: c.students.length,
          frequenciaMedia: total > 0 ? Math.round((presentes / total) * 100) : 100,
        };
      });

      const contextoEscolar = {
        totalAlunos: resumoAlunos.length,
        distribuicaoRisco: {
          Baixo: resumoAlunos.filter((a) => a.risco === 'Baixo').length,
          Medio: resumoAlunos.filter((a) => a.risco === 'Médio').length,
          Alto: resumoAlunos.filter((a) => a.risco === 'Alto').length,
        },
        turmas: resumoTurmas,
        alunos: resumoAlunos,
        proximosOuRecentesEventos: events.map((e) => ({
          titulo: e.title,
          tipo: e.type,
          abonaFalta: e.excusesAbsence,
          publico: e.audience,
          inicio: e.startDate.toISOString().split('T')[0],
          fim: e.endDate.toISOString().split('T')[0],
        })),
        totalOcorrenciasRecentes: incidents.length,
      };

      const systemPrompt = `Você é o Assistente Inteligente do PresenSee (sistema escolar de monitoramento de frequência biométrica e prevenção à evasão escolar).
Responda SEMPRE em português do Brasil, de forma clara, objetiva e profissional, usando EXCLUSIVAMENTE os dados reais fornecidos no contexto escolar abaixo.

REGRAS DE NEGÓCIO DO PRESENSEE:
1. Faltas justificadas/abonadas (atestados ou eventos escolares com abono) contam como presença válida no cálculo de frequência.
2. Níveis de risco de evasão: Frequência >= 90% = "Baixo", entre 75% e 89% = "Médio", < 75% = "Alto".
3. Você DEVE responder estritamente em formato JSON válido com a estrutura:
{
  "texto": "Sua resposta textual clara e direta aqui.",
  "grafico": null
}
4. QUANDO O USUÁRIO PEDIR UM GRÁFICO, VISUALIZAÇÃO, COMPARAÇÃO OU DISTRIBUIÇÃO (ou quando um gráfico enriquecer claramente a análise solicitada), preencha o campo "grafico" seguindo EXATAMENTE este contrato:
{
  "titulo": "Título curto do gráfico",
  "subtitulo": "Descrição curta do que está sendo medido",
  "tipo": "colunas" | "barras" | "linha" | "area" | "pizza" | "dispersao",
  "eixoX": "Nome opcional do eixo X (obrigatório se tipo for dispersao)",
  "eixoY": "Nome opcional do eixo Y (obrigatório se tipo for dispersao)",
  "dados": [
    // Para "colunas", "barras", "linha", "area", "pizza":
    { "nome": "Rótulo", "valor": 85 }
    // Para "dispersao" (ex: Frequência x Notas):
    // { "x": 92, "y": 8.5, "nome": "Nome do Aluno" }
  ]
}
5. Se não houver dados numéricos suficientes para um gráfico específico (ex: nenhuma nota lançada para dispersão), explique isso educadamente no campo "texto" e deixe "grafico": null. Nunca invente alunos ou números fictícios.

DADOS REAIS DA ESCOLA:
${JSON.stringify(contextoEscolar)}`;

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
          temperature: 0.2,
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
        texto: parsed.texto || 'Análise concluída.',
        grafico: graficoValido,
      });
    } catch (error) {
      console.error('Erro no ChatController:', error);
      return res.status(500).json({ error: 'Erro interno ao processar o assistente.' });
    }
  }
}