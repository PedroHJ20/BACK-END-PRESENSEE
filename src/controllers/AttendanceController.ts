import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

interface ConfigHorarioAula {
  classId: string;
  horaInicio: string; // Ex: "07:00"
  horaLimite: string; // Ex: "07:30"
  marcarFaltaAposLimite: boolean;
}

function normalizarTexto(valor: unknown): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ºª°]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function obterHoraMinutosRecife(dataObj = new Date()): string {
  return dataObj.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Recife',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function horarioPassouDoLimite(horaAtualHHMM: string, horaLimiteHHMM: string): boolean {
  if (!horaLimiteHHMM || !/^\d{2}:\d{2}$/.test(horaLimiteHHMM)) return false;
  return horaAtualHHMM > horaLimiteHHMM;
}

async function verificarEventoAbonaAlunoNoDia(
  escolaId: string | null,
  nomeTurmaAluno: string | undefined,
  dataLocalStr: string
): Promise<boolean> {
  if (!escolaId) return false;

  const eventosAbono = await prisma.event.findMany({
    where: {
      escolaId,
      excusesAbsence: true,
    },
  });

  const turmaNorm = normalizarTexto(nomeTurmaAluno);

  return eventosAbono.some((ev) => {
    const inicioStr = ev.startDate.toISOString().split('T')[0] ?? '';
    const fimStr = ev.endDate.toISOString().split('T')[0] ?? '';
    if (!inicioStr || !fimStr || dataLocalStr < inicioStr || dataLocalStr > fimStr) return false;

    const publicoNorm = normalizarTexto(ev.audience);
    if (!publicoNorm || publicoNorm === 'toda a escola' || publicoNorm === 'todas as turmas') {
      return true;
    }

    return (
      Boolean(turmaNorm) &&
      (turmaNorm === publicoNorm ||
        publicoNorm.includes(turmaNorm) ||
        turmaNorm.includes(publicoNorm))
    );
  });
}

async function buscarConfigHorario(escolaId: string | null, classId: string): Promise<ConfigHorarioAula | null> {
  if (!escolaId) return null;

  const registros = await prisma.incident.findMany({
    where: {
      escolaId,
      type: 'CONFIG_HORARIO_AULA',
    },
    orderBy: { date: 'desc' },
  });

  let configGeral: ConfigHorarioAula | null = null;
  for (const reg of registros) {
    try {
      const parsed = JSON.parse(reg.description) as ConfigHorarioAula;
      if (parsed.classId === classId) return parsed;
      if (parsed.classId === 'TODAS' && !configGeral) configGeral = parsed;
    } catch {
      // Ignora JSON inválido
    }
  }
  return configGeral;
}

export const AttendanceController = {
  // 0. Listar chamadas (usado pelo Totem para sincronizar presenças/faltas do dia)
  async index(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const { classId, date, studentId } = req.query;
      const where: any = {};

      if (user.role !== 'ADMIN') {
        if (!user.escolaId) return res.json([]);
        where.student = { escolaId: user.escolaId };
      }

      if (classId && classId !== 'TODAS') {
        where.classId = String(classId);
      }

      if (studentId) {
        where.studentId = String(studentId);
      }

      if (date) {
        const dataBase = new Date(`${String(date)}T00:00:00.000-03:00`);
        const fimDia = new Date(`${String(date)}T23:59:59.999-03:00`);
        if (!isNaN(dataBase.getTime())) {
          where.date = { gte: dataBase, lte: fimDia };
        }
      }

      const attendances = await prisma.attendance.findMany({
        where,
        orderBy: { date: 'desc' },
      });

      return res.json(attendances);
    } catch (error) {
      console.error("Erro ao listar chamadas:", error);
      return res.status(500).json({ error: "Erro ao buscar registros de frequência." });
    }
  },

  // 0.1 Consultar configuração de horário limite de entrada definida pelo monitor
  async getScheduleConfig(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const classId = String(req.query.classId || 'TODAS');
      const escolaId = user.escolaId || (req.query.escolaId ? String(req.query.escolaId) : null);

      const config = await buscarConfigHorario(escolaId, classId);
      return res.json(
        config || {
          classId,
          horaInicio: '07:00',
          horaLimite: '07:30',
          marcarFaltaAposLimite: true,
        }
      );
    } catch (error) {
      console.error("Erro ao buscar configuração de horário:", error);
      return res.status(500).json({ error: "Erro ao buscar horário limite." });
    }
  },

  // 0.2 Salvar configuração de horário limite de entrada (definido pelo monitor)
  async saveScheduleConfig(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const { classId = 'TODAS', horaInicio = '07:00', horaLimite = '07:30', marcarFaltaAposLimite = true } = req.body;
      const escolaId = user.escolaId || req.body.escolaId;

      if (!escolaId) {
        return res.status(400).json({ error: "Escola não identificada para salvar o horário." });
      }

      const payload: ConfigHorarioAula = {
        classId: String(classId),
        horaInicio: String(horaInicio),
        horaLimite: String(horaLimite),
        marcarFaltaAposLimite: Boolean(marcarFaltaAposLimite),
      };

      const existentes = await prisma.incident.findMany({
        where: {
          escolaId,
          type: 'CONFIG_HORARIO_AULA',
        },
      });

      const regAlvo = existentes.find((r) => {
        try {
          return JSON.parse(r.description).classId === payload.classId;
        } catch {
          return false;
        }
      });

      if (regAlvo) {
        await prisma.incident.update({
          where: { id: regAlvo.id },
          data: {
            description: JSON.stringify(payload),
            date: new Date(),
          },
        });
      } else {
        await prisma.incident.create({
          data: {
            type: 'CONFIG_HORARIO_AULA',
            description: JSON.stringify(payload),
            escolaId,
          },
        });
      }

      return res.json(payload);
    } catch (error) {
      console.error("Erro ao salvar configuração de horário:", error);
      return res.status(500).json({ error: "Erro ao salvar horário limite." });
    }
  },

  // 1. Registrar chamada automaticamente (via câmera) respeitando o horário limite e eventos com abono
  async create(req: Request, res: Response) {
    try {
      const { studentId, classId, status } = req.body;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      if (!studentId) {
        return res.status(400).json({ error: "O ID do aluno (studentId) é obrigatório." });
      }

      const student = await prisma.student.findUnique({
        where: { id: String(studentId) },
        include: { class: true },
      });

      if (!student) {
        return res.status(404).json({ error: "Aluno não encontrado." });
      }

      if (user.role !== 'ADMIN' && student.escolaId !== user.escolaId) {
        return res.status(403).json({ error: "Acesso negado. O aluno não pertence à sua instituição." });
      }

      const turmaFinalId =
        classId && String(classId) !== 'TODAS' ? String(classId) : student.classId;

      const agora = new Date();
      const dataLocalStr = agora.toLocaleDateString('en-CA', { timeZone: 'America/Recife' });
      const horaAtualHHMM = obterHoraMinutosRecife(agora);
      const inicioDia = new Date(`${dataLocalStr}T00:00:00.000-03:00`);
      const fimDia = new Date(`${dataLocalStr}T23:59:59.999-03:00`);

      const registroExistente = await prisma.attendance.findFirst({
        where: {
          studentId: student.id,
          date: {
            gte: inicioDia,
            lte: fimDia,
          },
        },
      });

      if (registroExistente) {
        const configHorario = await buscarConfigHorario(student.escolaId, turmaFinalId);
        const passouLimite =
          configHorario?.marcarFaltaAposLimite &&
          horarioPassouDoLimite(horaAtualHHMM, configHorario.horaLimite);

        if (registroExistente.status === 'EXCUSED' && !passouLimite && (!status || status === 'PRESENT')) {
          const atualizado = await prisma.attendance.update({
            where: { id: registroExistente.id },
            data: { status: 'PRESENT', date: agora },
          });
          return res.status(200).json({
            message: "Presença registrada com sucesso pela câmera!",
            foraDoHorario: false,
            attendance: atualizado,
          });
        }

        return res.status(200).json({
          message:
            registroExistente.status === 'ABSENT'
              ? "Falta já registrada anteriormente hoje (fora do horário limite)."
              : registroExistente.status === 'EXCUSED'
              ? "Aluno possui falta justificada por evento ou atestado hoje."
              : "Frequência já registrada anteriormente hoje!",
          alreadyRegistered: true,
          attendance: registroExistente,
        });
      }

      const configHorario = await buscarConfigHorario(student.escolaId, turmaFinalId);
      const diaAbonadoPorEvento = await verificarEventoAbonaAlunoNoDia(
        student.escolaId,
        student.class?.name,
        dataLocalStr
      );

      let statusFinal: 'PRESENT' | 'ABSENT' | 'EXCUSED' = status || 'PRESENT';
      let foraDoHorario = false;

      if (
        !status &&
        configHorario?.marcarFaltaAposLimite &&
        horarioPassouDoLimite(horaAtualHHMM, configHorario.horaLimite)
      ) {
        if (diaAbonadoPorEvento) {
          statusFinal = 'EXCUSED';
        } else {
          statusFinal = 'ABSENT';
          foraDoHorario = true;
        }
      }

      const attendance = await prisma.attendance.create({
        data: {
          studentId: student.id,
          classId: turmaFinalId,
          status: statusFinal,
          date: agora,
        },
      });

      return res.status(201).json({
        message: foraDoHorario
          ? `Entrada às ${horaAtualHHMM} após o limite (${configHorario?.horaLimite}). Registrado como FALTA.`
          : statusFinal === 'EXCUSED'
          ? "Dia abonado por evento escolar (Justificada)."
          : "Presença registrada com sucesso pela câmera!",
        foraDoHorario,
        horaLimite: configHorario?.horaLimite || null,
        attendance,
      });
    } catch (error) {
      console.error("Erro ao registrar presença:", error);
      return res.status(500).json({ error: "Erro ao processar o check-in da câmera." });
    }
  },

  // 1.1 Encerrar chamada do dia/turma: aplica EXCUSED se houver evento com abono no dia, ou ABSENT caso contrário
  async closeDailyAttendance(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const classId = req.body.classId ? String(req.body.classId) : 'TODAS';
      const agora = new Date();
      const dataLocalStr = agora.toLocaleDateString('en-CA', { timeZone: 'America/Recife' });
      const inicioDia = new Date(`${dataLocalStr}T00:00:00.000-03:00`);
      const fimDia = new Date(`${dataLocalStr}T23:59:59.999-03:00`);

      const filtroAlunos: any = {};
      if (user.role !== 'ADMIN') {
        if (!user.escolaId) return res.status(403).json({ error: "Escola não vinculada." });
        filtroAlunos.escolaId = user.escolaId;
      }
      if (classId !== 'TODAS') {
        filtroAlunos.classId = classId;
      }

      const alunos = await prisma.student.findMany({
        where: filtroAlunos,
        include: { class: true },
      });

      const chamadasHoje = await prisma.attendance.findMany({
        where: {
          studentId: { in: alunos.map((a) => a.id) },
          date: { gte: inicioDia, lte: fimDia },
        },
        select: { studentId: true },
      });

      const idsJaRegistrados = new Set(chamadasHoje.map((c) => c.studentId));
      const semRegistro = alunos.filter((a) => !idsJaRegistrados.has(a.id));

      let faltasAplicadas = 0;
      let abonadasPorEvento = 0;

      if (semRegistro.length > 0) {
        const registrosParaCriar: Array<{
          studentId: string;
          classId: string;
          status: 'ABSENT' | 'EXCUSED';
          date: Date;
        }> = [];

        for (const aluno of semRegistro) {
          const abonado = await verificarEventoAbonaAlunoNoDia(
            aluno.escolaId,
            aluno.class?.name,
            dataLocalStr
          );
          if (abonado) {
            abonadasPorEvento++;
            registrosParaCriar.push({
              studentId: aluno.id,
              classId: aluno.classId,
              status: 'EXCUSED',
              date: agora,
            });
          } else {
            faltasAplicadas++;
            registrosParaCriar.push({
              studentId: aluno.id,
              classId: aluno.classId,
              status: 'ABSENT',
              date: agora,
            });
          }
        }

        await prisma.attendance.createMany({
          data: registrosParaCriar,
          skipDuplicates: true,
        });
      }

      return res.json({
        message:
          abonadasPorEvento > 0
            ? `Chamada encerrada: ${faltasAplicadas} falta(s) aplicada(s) e ${abonadasPorEvento} abonada(s) por evento escolar.`
            : `Chamada encerrada. ${faltasAplicadas} falta(s) aplicada(s) aos estudantes ausentes.`,
        faltasAplicadas,
        abonadasPorEvento,
      });
    } catch (error) {
      console.error("Erro ao encerrar chamada do dia:", error);
      return res.status(500).json({ error: "Erro ao aplicar faltas aos ausentes." });
    }
  },

  // 2. Listar todos os alertas de evasão para a coordenação
  async listAlerts(req: Request, res: Response) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      let filtroEscola = {};

      if (user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.json([]);
        }
        filtroEscola = {
          student: {
            escolaId: user.escolaId,
          },
        };
      }

      const alerts = await prisma.alert.findMany({
        where: filtroEscola,
        include: {
          student: true,
        },
      });

      return res.json(alerts);
    } catch (error) {
      console.error("Erro ao buscar alertas:", error);
      return res.status(500).json({ error: "Erro ao buscar alertas." });
    }
  },
};