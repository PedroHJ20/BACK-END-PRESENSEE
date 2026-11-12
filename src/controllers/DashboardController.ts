import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

const NOMES_MESES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

export class DashboardController {
  static async getSummary(req: Request, res: Response) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      // Lê o filtro de período enviado pelo front-end (padrão: 6 meses)
      const mesesParam = Number(req.query.meses);
      const qtdMeses = [3, 6, 12].includes(mesesParam) ? mesesParam : 6;

      let filtroEscola: any = {};

      if (user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.json({
            totalAlunos: 0,
            alunosAltoRisco: 0,
            alunosRisco: 0,
            alunosBaixoRisco: 0,
            taxaFrequenciaGeral: 0,
            turmas: [],
            evolucaoRisco: [],
            frequenciaPorSemana: [
              { dia: "Seg", frequencia: 0 },
              { dia: "Ter", frequencia: 0 },
              { dia: "Qua", frequencia: 0 },
              { dia: "Qui", frequencia: 0 },
              { dia: "Sex", frequencia: 0 }
            ]
          });
        }
        filtroEscola = { escolaId: user.escolaId };
      }

      // Busca paralela para reduzir latência com o banco na nuvem
      const [students, classes] = await Promise.all([
        prisma.student.findMany({
          where: filtroEscola,
          include: {
            attendances: true,
            alerts: { where: { status: 'PENDING' } },
            class: true
          }
        }),
        prisma.class.findMany({
          where: filtroEscola,
          include: {
            students: {
              include: { attendances: true }
            }
          }
        })
      ]);

      const temAlunos = students.length > 0;

      let highRisk = 0;
      let mediumRisk = 0;
      let lowRisk = 0;
      let totalPresent = 0;
      let totalAttendances = 0;

      // Acumuladores reais por dia da semana (1 = Seg ... 5 = Sex)
      const diasSemanaStats: Record<number, { present: number; total: number }> = {
        1: { present: 0, total: 0 },
        2: { present: 0, total: 0 },
        3: { present: 0, total: 0 },
        4: { present: 0, total: 0 },
        5: { present: 0, total: 0 }
      };

      const todasPresencas: { date: Date; status: string }[] = [];

      students.forEach((student) => {
        const total = student.attendances.length;
        const present = student.attendances.filter((a) => a.status === 'PRESENT').length;
        totalAttendances += total;
        totalPresent += present;

        student.attendances.forEach((att) => {
          const dataAtt = new Date(att.date);
          todasPresencas.push({ date: dataAtt, status: att.status });

          const diaSemana = dataAtt.getDay(); // 0 = Dom, 1 = Seg ... 5 = Sex, 6 = Sab
          if (diasSemanaStats[diaSemana]) {
            diasSemanaStats[diaSemana].total++;
            if (att.status === 'PRESENT') {
              diasSemanaStats[diaSemana].present++;
            }
          }
        });

        const freq = total > 0 ? (present / total) * 100 : 100;

        if (freq < 70 || student.alerts.length >= 2) {
          highRisk++;
        } else if (freq < 85 || student.alerts.length === 1) {
          mediumRisk++;
        } else {
          lowRisk++;
        }
      });

      // Se não houver alunos ou nenhuma chamada registrada, frequência é 0%
      const overallFrequency = (temAlunos && totalAttendances > 0)
        ? Math.round((totalPresent / totalAttendances) * 100)
        : 0;

      const classesSummary = classes.map((c) => {
        let classPresent = 0;
        let classTotal = 0;

        c.students.forEach((s) => {
          classTotal += s.attendances.length;
          classPresent += s.attendances.filter((a) => a.status === 'PRESENT').length;
        });

        const frequency = (c.students.length > 0 && classTotal > 0)
          ? Math.round((classPresent / classTotal) * 100)
          : 0;

        return {
          turma: c.name,
          frequencia: frequency
        };
      });

      // Monta série histórica dinâmica para 3, 6 ou 12 meses
      const hoje = new Date();
      const evolucaoRisco = [];

      for (let i = qtdMeses - 1; i >= 0; i--) {
        const refDate = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const mesIndex = refDate.getMonth();
        const ano = refDate.getFullYear();

        if (!temAlunos) {
          evolucaoRisco.push({
            periodo: NOMES_MESES[mesIndex],
            risco: 0,
            frequencia: 0
          });
          continue;
        }

        const presencasDoMes = todasPresencas.filter(
          (p) => p.date.getMonth() === mesIndex && p.date.getFullYear() === ano
        );

        let taxaRiscoMes = 0;
        let taxaFreqMes = 0;

        if (presencasDoMes.length > 0) {
          const presentesMes = presencasDoMes.filter((p) => p.status === 'PRESENT').length;
          taxaFreqMes = Math.round((presentesMes / presencasDoMes.length) * 100);
          taxaRiscoMes = Math.max(0, 100 - taxaFreqMes);
        } else if (i === 0) {
          // Mês atual: reflete o risco atual calculado dos alunos
          taxaRiscoMes = Math.round((highRisk / students.length) * 100);
          taxaFreqMes = overallFrequency;
        }

        evolucaoRisco.push({
          periodo: NOMES_MESES[mesIndex],
          risco: taxaRiscoMes,
          frequencia: taxaFreqMes
        });
      }

      // Frequência por dia da semana (0% garantido se não houver alunos ou registros no dia)
      const frequenciaPorSemana = [
        { dia: "Seg", key: 1 },
        { dia: "Ter", key: 2 },
        { dia: "Qua", key: 3 },
        { dia: "Qui", key: 4 },
        { dia: "Sex", key: 5 }
      ].map(({ dia, key }) => {
        const stat = diasSemanaStats[key];
        const freqDia = (temAlunos && stat && stat.total > 0)
          ? Math.round((stat.present / stat.total) * 100)
          : 0;

        return { dia, frequencia: freqDia };
      });

      return res.json({
        totalAlunos: students.length,
        alunosAltoRisco: highRisk,
        alunosRisco: mediumRisk,
        alunosBaixoRisco: lowRisk,
        taxaFrequenciaGeral: overallFrequency,
        turmas: classesSummary,
        evolucaoRisco,
        frequenciaPorSemana
      });
    } catch (error) {
      console.error("Erro ao carregar dados do dashboard:", error);
      return res.status(500).json({ error: 'Erro ao carregar dados do dashboard.' });
    }
  }
}