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
      console.error("Erro ao criar aluno:", error);
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
      console.error("Erro ao listar alunos:", error);
      res.status(500).json({ error: "Erro ao buscar os alunos." });
    }
  },

  // 3. Buscar o perfil completo de um único aluno
  async show(req: Request, res: Response) {
    // CORREÇÃO APLICADA AQUI:
    const id = req.params.id as string;
    
    try {
      const student = await prisma.student.findUnique({
        where: { id },
        include: {
          class: true,
          attendances: true,
          incidents: true,
          alerts: true,
          grades: true
        }
      });

      if (!student) {
        return res.status(404).json({ error: "Aluno não encontrado" });
      }
      
      return res.json(student);
    } catch (error) {
      console.error("Erro ao buscar perfil do aluno:", error);
      return res.status(500).json({ error: "Erro interno ao buscar aluno" });
    }
  },

  // 4. Cadastrar/Atualizar a foto biométrica do aluno
  async uploadBiometry(req: Request, res: Response) {
    try {
      const id = req.params.id as string;

      if (!req.file) {
        return res.status(400).json({ error: "Nenhuma imagem foi enviada." });
      }

      // O multer-storage-cloudinary coloca o link final (URL) diretamente no 'req.file.path'
      const imageUrl = req.file.path; 

      const student = await prisma.student.update({
        where: { id },
        data: { biometricDataUrl: imageUrl },
      });

      return res.json({ 
        message: "Biometria atualizada com sucesso na nuvem!",
        student 
      });
    } catch (error) {
      // Registo de erro detalhado para diagnosticar problemas com o Cloudinary
      console.error("Erro detalhado no uploadBiometry:", JSON.stringify(error, null, 2));
      return res.status(500).json({ error: "Erro ao atualizar biometria." });
    }
  },

  // 5. Histórico detalhado para o Modal de Calendário
  async attendanceHistory(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const month = req.query.month as string | undefined;
      const year = req.query.year as string | undefined;

      let dateFilter = {};
      
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
          studentId: id,
          ...(Object.keys(dateFilter).length > 0 && { date: dateFilter })
        },
        orderBy: {
          date: 'asc' // Ordena cronologicamente
        }
      });

      res.json(history);
    } catch (error) {
      console.error("Erro ao buscar histórico:", error);
      res.status(500).json({ error: "Erro ao buscar o histórico de presença." });
    }
  }
};