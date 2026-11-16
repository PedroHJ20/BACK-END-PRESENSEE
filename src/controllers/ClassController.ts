import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

function normalizarTexto(valor: unknown): string {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ºª°]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function parseAnoLetivo(valor: unknown, fallback: number): number {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    return fallback;
  }
  const num = Number(valor);
  return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

export const ClassController = {
  // 1. Criar Turma (com bloqueio de duplicidade)
  async create(req: Request, res: Response) {
    try {
      const { name, year, course, shift } = req.body;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: "O nome da turma é obrigatório." });
      }

      let escolaId = req.body.escolaId;
      if (user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.status(403).json({ error: "Gestor sem escola vinculada." });
        }
        escolaId = user.escolaId;
      }

      const anoLetivo = parseAnoLetivo(year, new Date().getFullYear());

      const turmasEscola = await prisma.class.findMany({
        where: escolaId ? { escolaId } : {},
        select: { id: true, name: true, shift: true, year: true }
      });

      const nomeNorm = normalizarTexto(name);
      const turnoNorm = normalizarTexto(shift);

      const duplicada = turmasEscola.find((t) => {
        const mesmoNome = normalizarTexto(t.name) === nomeNorm;
        const mesmoTurno = !turnoNorm || !normalizarTexto(t.shift) || normalizarTexto(t.shift) === turnoNorm;
        const mesmoAno = !t.year || t.year === anoLetivo;
        return mesmoNome && mesmoTurno && mesmoAno;
      });

      if (duplicada) {
        return res.status(409).json({
          error: `Já existe uma turma cadastrada como "${duplicada.name}"${duplicada.shift ? ` (${duplicada.shift})` : ''}.`
        });
      }

      const newClass = await prisma.class.create({
        data: {
          name: String(name).trim(),
          year: anoLetivo,
          course: course ? String(course).trim() : "",
          shift: shift ? String(shift).trim() : "",
          escolaId
        }
      });

      return res.status(201).json(newClass);
    } catch (error) {
      console.error("Erro ao criar turma:", error);
      return res.status(500).json({ error: "Erro ao criar turma." });
    }
  },

  // 2. Listar Turmas (com cálculos de frequência considerando PRESENT + EXCUSED e risco alinhado)
  async index(req: Request, res: Response) {
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
        filtroEscola = { escolaId: user.escolaId };
      }

      const classes = await prisma.class.findMany({
        where: filtroEscola,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { students: true }
          },
          students: {
            include: {
              attendances: true,
              alerts: { where: { status: 'PENDING' } }
            }
          }
        }
      });

      const formattedClasses = classes.map(c => {
        let highRisk = 0;
        let mediumRisk = 0;
        let totalPresent = 0;
        let totalAttendances = 0;

        c.students.forEach(student => {
          const total = student.attendances.length;
          const present = student.attendances.filter(
            a => a.status === 'PRESENT' || a.status === 'EXCUSED'
          ).length;
          totalAttendances += total;
          totalPresent += present;

          const freq = total > 0 ? Math.round((present / total) * 100) : 100;
          if (freq < 75 || student.alerts.length >= 2) {
            highRisk++;
          } else if (freq < 90 || student.alerts.length === 1) {
            mediumRisk++;
          }
        });

        const attendanceRate = totalAttendances > 0
          ? Math.round((totalPresent / totalAttendances) * 100)
          : 100;

        return {
          id: c.id,
          name: c.name,
          course: c.course,
          shift: c.shift,
          year: c.year,
          _count: { students: c._count.students },
          attendanceRate,
          attentionStudents: mediumRisk,
          highRiskStudents: highRisk
        };
      });

      return res.json(formattedClasses);
    } catch (error) {
      console.error("Erro ao buscar turmas:", error);
      return res.status(500).json({ error: "Erro ao buscar as turmas." });
    }
  },

  // 3. Atualizar Turma
  async update(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const { name, year, course, shift } = req.body;
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const turmaAtual = await prisma.class.findUnique({ where: { id } });
      if (!turmaAtual) {
        return res.status(404).json({ error: "Turma não encontrada." });
      }

      if (user.role !== 'ADMIN' && turmaAtual.escolaId !== user.escolaId) {
        return res.status(403).json({ error: "Acesso negado a esta turma." });
      }

      const novoNome = name !== undefined ? String(name).trim() : turmaAtual.name;
      const novoTurno = shift !== undefined ? String(shift).trim() : turmaAtual.shift;
      const novoAno = parseAnoLetivo(year, turmaAtual.year);
      const novoCurso = course !== undefined ? String(course).trim() : turmaAtual.course;

      if (!novoNome) {
        return res.status(400).json({ error: "O nome da turma não pode ficar vazio." });
      }

      const outrasTurmas = await prisma.class.findMany({
        where: {
          escolaId: turmaAtual.escolaId,
          NOT: { id }
        },
        select: { id: true, name: true, shift: true, year: true }
      });

      const duplicada = outrasTurmas.find((t) => {
        const mesmoNome = normalizarTexto(t.name) === normalizarTexto(novoNome);
        const mesmoTurno = !normalizarTexto(novoTurno) || !normalizarTexto(t.shift) || normalizarTexto(t.shift) === normalizarTexto(novoTurno);
        const mesmoAno = !t.year || t.year === novoAno;
        return mesmoNome && mesmoTurno && mesmoAno;
      });

      if (duplicada) {
        return res.status(409).json({
          error: `Já existe outra turma cadastrada como "${duplicada.name}"${duplicada.shift ? ` (${duplicada.shift})` : ''}.`
        });
      }

      const updatedClass = await prisma.class.update({
        where: { id },
        data: {
          name: novoNome,
          year: novoAno,
          course: novoCurso,
          shift: novoTurno
        }
      });

      return res.json(updatedClass);
    } catch (error) {
      console.error("Erro ao atualizar turma:", error);
      return res.status(500).json({ error: "Erro ao atualizar turma." });
    }
  },

  // 4. Excluir Turma
  async delete(req: Request, res: Response) {
    try {
      const id = String(req.params.id);
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const turma = await prisma.class.findUnique({
        where: { id },
        include: { _count: { select: { students: true } } }
      });

      if (!turma) {
        return res.status(404).json({ error: "Turma não encontrada." });
      }

      if (user.role !== 'ADMIN' && turma.escolaId !== user.escolaId) {
        return res.status(403).json({ error: "Acesso negado a esta turma." });
      }

      if (turma._count.students > 0) {
        return res.status(400).json({
          error: `Não é possível excluir esta turma pois ela possui ${turma._count.students} aluno(s) matriculado(s). Transfira ou remova os alunos primeiro.`
        });
      }

      await prisma.attendance.deleteMany({ where: { classId: id } });
      await prisma.class.delete({ where: { id } });

      return res.json({ message: "Turma excluída com sucesso!" });
    } catch (error) {
      console.error("Erro ao excluir turma:", error);
      return res.status(500).json({ error: "Erro ao excluir turma." });
    }
  }
};