import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const ClassController = {
  async create(req: Request, res: Response) {
    try {
      const { name, year, course, shift } = req.body;
      
      // 1. Pega os dados diretamente do middleware (sem precisar consultar o banco!)
      const user = req.user; 
      
      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      // 2. Define o escolaId com base no perfil (Admin pode enviar no body, Gestor pega do token)
      let escolaId = req.body.escolaId; 
      
      if (user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.status(403).json({ error: "Gestor sem escola vinculada." });
        }
        escolaId = user.escolaId;
      }

      const newClass = await prisma.class.create({ 
        data: { 
          name, 
          year, 
          course, 
          shift,
          escolaId // Vincula a turma à escola de forma blindada
        } 
      });
      
      return res.status(201).json(newClass);
    } catch (error) {
      console.error("Erro ao criar turma:", error);
      return res.status(500).json({ error: "Erro ao criar turma." });
    }
  },

  async index(req: Request, res: Response) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      let filtroEscola = {};

      // 3. Regra Multi-Tenant: O Prisma filtra automaticamente pela escola do gestor logado
      if (user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.json([]); 
        }
        filtroEscola = { escolaId: user.escolaId };
      }

      const classes = await prisma.class.findMany({
        where: filtroEscola, 
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

      // 4. Mapeamento de cálculos mantido intacto (excelente lógica, parabéns!)
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

      return res.json(formattedClasses);
    } catch (error) {
      console.error("Erro ao buscar turmas:", error);
      return res.status(500).json({ error: "Erro ao buscar as turmas." });
    }
  }
};