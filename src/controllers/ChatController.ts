import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

const MODELOS_CHAT_GROQ = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
];

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

function calcularIdade(birthDate: Date | null | undefined): number | null {
  if (!birthDate) return null;
  const hoje = new Date();
  const nasc = new Date(birthDate);
  if (Number.isNaN(nasc.getTime())) return null;
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const mesDiff = hoje.getMonth() - nasc.getMonth();
  if (mesDiff < 0 || (mesDiff === 0 && hoje.getDate() < nasc.getDate())) {
    idade--;
  }
  return idade >= 0 ? idade : null;
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

      const apiKey = process.env.GROQ_API_KEY?.trim();
      if (!apiKey) {
        return res.status(500).json({
          error: 'Chave GROQ_API_KEY não configurada no servidor.',
        });
      }

      const isAdmin = user.role === 'ADMIN';
      const filtroEscola = !isAdmin && user.escolaId ? { escolaId: user.escolaId } : {};
      const filtroAttendance =
        !isAdmin && user.escolaId ? { student: { escolaId: user.escolaId } } : {};

      // Consulta todas as tabelas reais do schema.prisma no NeonDB
      const [
        escolaInfo,
        todasEscolas,
        students,
        classes,
        attendances,
        grades,
        alerts,
        events,
        incidents,
        chamados,
        comunicados,
      ] = await Promise.all([
        user.escolaId
          ? prisma.escola
              .findUnique({
                where: { id: user.escolaId },
                select: {
                  nome: true,
                  municipio: true,
                  uf: true,
                  rede: true,
                  bairro: true,
                  status: true,
                  inep: true,
                },
              })
              .catch(() => null)
          : Promise.resolve(null),
        isAdmin
          ? prisma.escola
              .findMany({
                select: {
                  id: true,
                  nome: true,
                  municipio: true,
                  uf: true,
                  rede: true,
                  status: true,
                },
              })
              .catch(() => [])
          : Promise.resolve([]),
        prisma.student
          .findMany({
            where: filtroEscola,
            include: { class: true },
          })
          .catch(() => []),
        prisma.class
          .findMany({
            where: filtroEscola,
          })
          .catch(() => []),
        prisma.attendance
          .findMany({
            where: filtroAttendance,
          })
          .catch(() => []),
        prisma.grade
          .findMany({
            where: filtroAttendance,
          })
          .catch(() => []),
        prisma.alert
          .findMany({
            where: filtroAttendance,
          })
          .catch(() => []),
        prisma.event
          .findMany({
            where: filtroEscola,
            orderBy: { startDate: 'desc' },
          })
          .catch(() => []),
        prisma.incident
          .findMany({
            where: filtroEscola,
            orderBy: { date: 'desc' },
          })
          .catch(() => []),
        isAdmin
          ? prisma.chamado
              .findMany({
                select: {
                  titulo: true,
                  escola: true,
                  categoria: true,
                  prioridade: true,
                  status: true,
                },
                orderBy: { criadoEm: 'desc' },
                take: 30,
              })
              .catch(() => [])
          : Promise.resolve([]),
        isAdmin
          ? prisma.comunicado
              .findMany({
                select: {
                  titulo: true,
                  tipo: true,
                  publico: true,
                  status: true,
                },
                orderBy: { criadoEm: 'desc' },
                take: 20,
              })
              .catch(() => [])
          : Promise.resolve([]),
      ]);

      const chamadasPorAluno = new Map<string, any[]>();
      attendances.forEach((a) => {
        if (!chamadasPorAluno.has(a.studentId)) chamadasPorAluno.set(a.studentId, []);
        chamadasPorAluno.get(a.studentId)!.push(a);
      });

      const notasPorAluno = new Map<string, any[]>();
      grades.forEach((g) => {
        if (!notasPorAluno.has(g.studentId)) notasPorAluno.set(g.studentId, []);
        notasPorAluno.get(g.studentId)!.push(g);
      });

      const alertasPorAluno = new Map<string, any[]>();
      alerts.forEach((al) => {
        if (!alertasPorAluno.has(al.studentId)) alertasPorAluno.set(al.studentId, []);
        alertasPorAluno.get(al.studentId)!.push(al);
      });

      const incidentesPorAluno = new Map<string, any[]>();
      incidents.forEach((inc) => {
        if (!inc.studentId) return;
        if (!incidentesPorAluno.has(inc.studentId)) incidentesPorAluno.set(inc.studentId, []);
        incidentesPorAluno.get(inc.studentId)!.push(inc);
      });

      const mapaAlunosNome = new Map<string, string>();
      students.forEach((s) => mapaAlunosNome.set(s.id, s.name));

      const resumoAlunos = students.map((s) => {
        const chamadasAluno = chamadasPorAluno.get(s.id) || [];
        const notasAluno = notasPorAluno.get(s.id) || [];
        const alertasAluno = alertasPorAluno.get(s.id) || [];
        const incidentesAluno = incidentesPorAluno.get(s.id) || [];

        const totalChamadas = chamadasAluno.length;
        const presencas = chamadasAluno.filter((a: any) => isPresenteOuAbonado(a.status)).length;
        const faltasNaoJustificadas = chamadasAluno.filter((a: any) => a.status === 'ABSENT').length;
        const justificadas = chamadasAluno.filter((a: any) => a.status === 'EXCUSED').length;
        const frequencia = totalChamadas > 0 ? Math.round((presencas / totalChamadas) * 100) : 100;
        const risco = frequencia < 75 ? 'Alto' : frequencia < 90 ? 'Médio' : 'Baixo';

        const mediaNotas =
          notasAluno.length > 0
            ? Number(
                (notasAluno.reduce((acc: number, n: any) => acc + n.value, 0) / notasAluno.length).toFixed(1)
              )
            : null;

        const ficha = extrairFichaCadastro(incidentesAluno);
        const ocorrenciasVisiveis = incidentesAluno.filter(
          (i: any) =>
            !['FICHA_CADASTRO', 'CONFIG_HORARIO_AULA', 'PENDENCIA', 'RESOLVIDO'].includes(i.type)
        );
        const pendenciasAbertas = incidentesAluno.filter((i: any) => i.type === 'PENDENCIA');

        const dataNascFinal = s.birthDate || (ficha.birthDate ? new Date(ficha.birthDate) : null);
        const idade = calcularIdade(dataNascFinal);

        return {
          nome: s.name,
          matricula: s.registration,
          dataNascimento: dataNascFinal ? new Date(dataNascFinal).toISOString().split('T')[0] : null,
          idade,
          turma: s.class?.name || 'Sem turma',
          modalidade: s.class?.course || '',
          turno: s.class?.shift || '',
          biometriaCadastrada: Boolean(s.biometricDataUrl),
          sexo: ficha.gender || null,
          bairro: ficha.bairro || null,
          municipio: ficha.cidade || null,
          uf: ficha.estado || null,
          frequencia,
          risco,
          totalChamadas,
          presencasEfetivas: presencas,
          faltasNaoJustificadas,
          justificadas,
          mediaNotas,
          notasPorDisciplina: notasAluno.map((n: any) => ({
            disciplina: n.subject,
            nota: n.value,
          })),
          alertasPendentes: alertasAluno.filter((al: any) => al.status === 'PENDING').length,
          totalOcorrencias: ocorrenciasVisiveis.length,
          pendenciasAbertas: pendenciasAbertas.length,
        };
      });

      const resumoTurmas = classes.map((c) => {
        const alunosDaTurma = students.filter((s) => s.classId === c.id);
        let total = 0;
        let presentes = 0;
        alunosDaTurma.forEach((st) => {
          const chamadasSt = chamadasPorAluno.get(st.id) || [];
          total += chamadasSt.length;
          presentes += chamadasSt.filter((a: any) => isPresenteOuAbonado(a.status)).length;
        });
        return {
          turma: c.name,
          modalidade: c.course,
          turno: c.shift,
          ano: c.year,
          totalAlunos: alunosDaTurma.length,
          frequenciaMedia: total > 0 ? Math.round((presentes / total) * 100) : 100,
        };
      });

      const contextoBancoReal: Record<string, any> = {
        fonte: 'Banco de dados real PostgreSQL (NeonDB)',
        perfilUsuario: user.role,
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
        ocorrenciasRegistradas: incidents
          .filter((inc) => !['FICHA_CADASTRO', 'CONFIG_HORARIO_AULA'].includes(inc.type))
          .slice(0, 40)
          .map((inc) => ({
            aluno: inc.studentId ? mapaAlunosNome.get(inc.studentId) || 'Aluno' : 'Geral',
            tipo: inc.type,
            data: inc.date.toISOString().split('T')[0],
            resolvida: inc.type === 'RESOLVIDO',
          })),
      };

      if (isAdmin) {
        contextoBancoReal.escolasRede = todasEscolas;
        contextoBancoReal.chamadosSuporte = chamados;
        contextoBancoReal.comunicados = comunicados;
      }

      const systemPrompt = `Você é o Assistente Oficial do PresenSee.

REGRAS DE COMPORTAMENTO E CONCISÃO:
1. Responda APENAS ao que o usuário perguntou. Nunca despeje estatísticas, listas ou resumos que não foram solicitados.
2. Se o usuário enviar apenas um cumprimento ou conversa casual (ex: "oi", "olá", "tudo bem?", "como você se chama?"), responda de forma curta, simpática e natural em 1 frase (ex: "Olá! Sou o assistente do PresenSee. Como posso ajudar você hoje?") e deixe "grafico": null — SEM listar dados da escola.
3. Quando o usuário fizer uma pergunta específica ou pedir um gráfico, utilize EXCLUSIVAMENTE os dados reais do banco de dados (NeonDB) fornecidos no JSON abaixo. Nunca invente ou estime números que não existam no JSON.
4. Se um dado específico solicitado estiver vazio/null para todos os registros no banco (por exemplo, nenhuma idade ou nota cadastrada), informe objetivamente que ainda não há registros desse campo no banco.

REGRAS DE CÁLCULO DO PRESENSEE:
- Faltas justificadas/abonadas (PRESENT ou EXCUSED) contam como presença válida na frequência.
- Risco de evasão: Frequência >= 90% = "Baixo", entre 75% e 89% = "Médio", < 75% = "Alto".

FORMATO DE RESPOSTA OBRIGATÓRIO (JSON válido):
{
  "texto": "Resposta direta e objetiva em português do Brasil.",
  "grafico": null
}

REGRAS PARA GRÁFICOS:
- Preencha "grafico" somente se o usuário pedir um gráfico, comparação ou visualização E houver dados reais no JSON abaixo:
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
- Para "dispersao", cada item em "dados" deve ter { "x": numero, "y": numero, "nome": "Nome Real" }.

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

      let groqResponse: globalThis.Response | null = null;
      let ultimoErro = '';

      for (const modelo of MODELOS_CHAT_GROQ) {
        const tentativa = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelo,
            messages: mensagensChat,
            temperature: 0,
            response_format: { type: 'json_object' },
          }),
        });

        if (tentativa.ok) {
          groqResponse = tentativa;
          break;
        }

        ultimoErro = `(${tentativa.status} - ${modelo}): ${await tentativa.text()}`;
        console.error('Tentativa Groq falhou:', ultimoErro);
      }

      if (!groqResponse || !groqResponse.ok) {
        return res.status(502).json({
          error: `Falha ao consultar a IA no momento. Detalhe: ${ultimoErro}`,
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