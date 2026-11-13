import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

export class IncidentController {
  static async index(req: Request, res: Response) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const studentId = req.query.studentId as string | undefined;

      let baseFilter: any = {};

      if (user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.json([]);
        }
        baseFilter.escolaId = user.escolaId;
      }

      if (studentId) {
        baseFilter.studentId = studentId;
      }

      const incidents = await prisma.incident.findMany({
        where: baseFilter,
        include: {
          student: {
            include: { class: true }
          }
        },
        orderBy: { date: 'desc' }
      });
      return res.json(incidents);
    } catch (error) {
      console.error("Erro ao buscar incidentes:", error);
      return res.status(500).json({ error: 'Erro ao buscar intervenções.' });
    }
  }

  static async create(req: Request, res: Response) {
    const { type, description, texto, studentId, date, title, priority, category, isPending } = req.body;

    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      let escolaId = req.body.escolaId;

      if (user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.status(403).json({ error: "Gestor sem escola vinculada não pode criar ocorrências." });
        }
        escolaId = user.escolaId;

        if (studentId) {
          const student = await prisma.student.findUnique({ where: { id: studentId } });
          if (!student || student.escolaId !== user.escolaId) {
            return res.status(403).json({ error: "Este aluno não pertence à sua escola." });
          }
        }
      }

      let finalType = type;
      if (!finalType) {
        finalType = isPending ? 'PENDENCIA' : 'NOTA';
      }

      let descFinal = description || texto || '';
      if (title && !descFinal.includes(title)) descFinal = `[${title}] ${descFinal}`;
      if (category && !descFinal.includes(category)) descFinal = `[${category}] ${descFinal}`;
      if (priority && !descFinal.includes(priority)) descFinal = `[Prioridade: ${priority}] ${descFinal}`;

      const payloadData: any = {
        type: finalType,
        description: descFinal.trim() || 'Sem descrição',
        escolaId
      };

      if (studentId) payloadData.studentId = studentId;
      if (date) payloadData.date = new Date(date);

      const queryOptions: any = { data: payloadData };

      if (studentId) {
        queryOptions.include = {
          student: { include: { class: true } }
        };
      }

      const incident = await prisma.incident.create(queryOptions);
      return res.status(201).json(incident);
    } catch (error) {
      console.error("Erro Prisma ao salvar ocorrencia:", error);
      return res.status(500).json({ error: 'Erro ao registrar ocorrência.' });
    }
  }

  static async uploadCertificate(req: Request, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const { studentId, inicio, fim, observacao } = req.body;
      const arquivo = req.file as any;

      if (!studentId) {
        return res.status(400).json({ error: "Informe o estudante da justificativa." });
      }
      if (!inicio || !fim) {
        return res.status(400).json({ error: "Informe a data de início e término do atestado." });
      }
      if (!arquivo || !arquivo.path) {
        return res.status(400).json({ error: "Nenhum arquivo de atestado foi enviado." });
      }

      const student = await prisma.student.findUnique({ where: { id: String(studentId) } });
      if (!student) {
        return res.status(404).json({ error: "Estudante não encontrado." });
      }

      let escolaId = student.escolaId;
      if (user.role !== 'ADMIN') {
        if (!user.escolaId || student.escolaId !== user.escolaId) {
          return res.status(403).json({ error: "Este aluno não pertence à sua escola." });
        }
        escolaId = user.escolaId;
      }

      const formatarBR = (iso: string) => iso.split('-').reverse().join('/');
      const periodoTexto = `${formatarBR(inicio)} até ${formatarBR(fim)}`;
      const obsTexto = observacao?.trim() ? ` | Obs: ${observacao.trim()}` : '';
      const urlCloudinary = arquivo.path;

      const incident = await prisma.incident.create({
        data: {
          type: 'Justificativa de Falta',
          studentId: String(studentId),
          escolaId,
          date: new Date(`${inicio}T12:00:00`),
          description: `Período: ${periodoTexto}${obsTexto} | [Atestado: ${urlCloudinary}]`
        },
        include: {
          student: { include: { class: true } }
        }
      });

      return res.status(201).json({
        incident,
        certificateUrl: urlCloudinary
      });
    } catch (error) {
      console.error("Erro ao registrar justificativa médica:", error);
      return res.status(500).json({ error: 'Erro ao salvar atestado médico.' });
    }
  }

  static async update(req: Request, res: Response) {
    const id = req.params.id as string;
    const { resolved, description, texto, feita, priority, prioridade } = req.body;

    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const incidentExistente = await prisma.incident.findUnique({ where: { id } });
      if (!incidentExistente) {
        return res.status(404).json({ error: "Ocorrência não encontrada." });
      }

      if (user.role !== 'ADMIN') {
        if (incidentExistente.escolaId !== user.escolaId) {
          return res.status(403).json({ error: "Sem permissão para editar esta ocorrência." });
        }
      }

      const updateData: any = {};

      let descAtual = description !== undefined ? description : texto;

      const novaPrioridade = priority || prioridade;
      if (novaPrioridade) {
        let stringBase = descAtual !== undefined ? descAtual : incidentExistente.description;

        if (/\[Prioridade:.*?\]/.test(stringBase)) {
          stringBase = stringBase.replace(/\[Prioridade:.*?\]/, `[Prioridade: ${novaPrioridade}]`);
        } else {
          stringBase = `[Prioridade: ${novaPrioridade}] ${stringBase}`;
        }
        descAtual = stringBase;
      }

      if (descAtual !== undefined) {
        updateData.description = descAtual;
      }

      const estadoResolvido = resolved !== undefined ? resolved : feita;
      if (estadoResolvido === true) updateData.type = 'RESOLVIDO';
      if (estadoResolvido === false) updateData.type = 'PENDENCIA';

      const incident = await prisma.incident.update({
        where: { id },
        data: updateData
      });
      return res.json(incident);
    } catch (error) {
      console.error("Erro ao atualizar incidente:", error);
      return res.status(500).json({ error: 'Erro ao atualizar registro.' });
    }
  }

  static async delete(req: Request, res: Response) {
    const id = req.params.id as string;

    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      if (user.role !== 'ADMIN') {
        const incidentExistente = await prisma.incident.findUnique({ where: { id } });

        if (!incidentExistente || incidentExistente.escolaId !== user.escolaId) {
          return res.status(403).json({ error: "Sem permissão para excluir esta ocorrência." });
        }
      }

      await prisma.incident.delete({ where: { id } });
      return res.status(204).send();
    } catch (error) {
      console.error("Erro ao deletar incidente:", error);
      return res.status(500).json({ error: 'Erro ao excluir registro.' });
    }
  }
}