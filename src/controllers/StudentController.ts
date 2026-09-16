import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export const StudentController = {
  // 1. Cadastrar um novo aluno
  async create(req: Request, res: Response) {
    try {
      const { registration, name, email, birthDate, classId } = req.body;
      
      const newStudent = await prisma.student.create({
        data: {
          registration,
          name,
          email,
          birthDate: birthDate ? new Date(birthDate) : null,
          classId
        }
      });
      
      res.status(201).json(newStudent);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erro ao cadastrar o aluno. Verifique os dados." });
    }
  },

  // 2. Listar todos os alunos com cálculo de Frequência e Risco (Para o Dashboard)
  async index(req: Request, res: Response) {
    try {
      const students = await prisma.student.findMany({
        include: { 
          class: true,
          attendances: true // Necessário para calcular as porcentagens
        }
      });

      const studentsWithDashboardData = students.map(student => {
        const totalClasses = student.attendances.length;
        const presentClasses = student.attendances.filter(a => a.status === 'PRESENT').length;

        let frequency = 100; // Começa com 100% se não houver registros
        if (totalClasses > 0) {
          frequency = Math.round((presentClasses / totalClasses) * 100);
        }

        // Define o Risco
        let risk = 'Baixo';
        if (frequency < 75) {
          risk = 'Alto';
        } else if (frequency <= 85) {
          risk = 'Médio';
        }

        // Remove o array pesado da resposta final para economizar banda
        const { attendances, ...studentData } = student;

        return {
          ...studentData,
          frequency,
          risk
        };
      });

      res.json(studentsWithDashboardData);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erro ao buscar os alunos." });
    }
  },

  // 3. Cadastrar/Atualizar a foto biométrica do aluno
  async uploadBiometry(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "Nenhum arquivo de imagem foi enviado." });
      }

      const biometricDataUrl = `/uploads/${file.filename}`;

      const updatedStudent = await prisma.student.update({
        where: { id },
        data: { biometricDataUrl }
      });

      res.json({
        message: "Foto biométrica cadastrada com sucesso!",
        student: updatedStudent
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erro ao salvar a biometria do aluno." });
    }
  },

 // 4. Histórico detalhado para o Modal de Calendário
  async attendanceHistory(req: Request, res: Response) {
    try {
      // Adicionamos 'as string' para forçar a tipagem correta e acalmar o TypeScript
      const id = req.params.id as string;
      const month = req.query.month as string | undefined;
      const year = req.query.year as string | undefined;

      let dateFilter = {};
      
      // Se informou mês e ano (ex: month=8 & year=2026), cria a regra de filtro
      if (month && year) {
        const startDate = new Date(Number(year), Number(month) - 1, 1);
        const endDate = new Date(Number(year), Number(month), 1);
        
        dateFilter = {
          gte: startDate,
          lt: endDate
        };
      }

      const history = await prisma.attendance.findMany({
        where: {
          studentId: id, // Agora o TypeScript tem certeza que 'id' é uma string válida
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter })
        },
        orderBy: {
          date: 'asc' // Ordena cronologicamente
        }
      });

      res.json(history);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erro ao buscar o histórico de presença." });
    }
  }
};