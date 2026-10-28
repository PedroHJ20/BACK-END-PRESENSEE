import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const ClassController = {
  async create(req: Request, res: Response) {
    try {
      const { name, year, course, shift } = req.body;
      const newClass = await prisma.class.create({ data: { name, year, course, shift } });
      res.status(201).json(newClass);
    } catch (error) {
      res.status(500).json({ error: "Erro ao criar turma." });
    }
  },

  async index(req: Request, res: Response) {
    try {
      const classes = await prisma.class.findMany({
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

      // Mapeia os dados calculando os riscos internos da turma
      const formattedClasses = classes.map(c => {
        let highRisk = 0;
        let mediumRisk = 0;
        let totalPresent = 0;
        let totalAttendances = 0;

        c.students.forEach(student => {
          const total = student.attendances.length;
          const present = student.attendances.filter(a => a.status === 'PRESENT').length;
          totalAttendances += total;
          totalPresent += present;

          const freq = total > 0 ? (present / total) * 100 : 100;
          if (freq < 70 || student.alerts.length >= 2) {
            highRisk++;
          } else if (freq < 85 || student.alerts.length === 1) {
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

      res.json(formattedClasses);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar as turmas." });
    }
  }
};