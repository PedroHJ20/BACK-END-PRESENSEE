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

function gerarDatasIntervalo(inicio: Date, fim: Date): string[] {
  const datas: string[] = [];
  const atual = new Date(inicio);
  atual.setUTCHours(12, 0, 0, 0);
  const limite = new Date(fim);
  limite.setUTCHours(12, 0, 0, 0);

  let contador = 0;
  while (atual <= limite && contador < 366) {
    const dataIso = atual.toISOString().split('T')[0];
    if (dataIso) datas.push(dataIso);
    atual.setDate(atual.getDate() + 1);
    contador++;
  }
  return datas;
}

async function aplicarAbonoEventoNasChamadas(params: {
  escolaId: string | null;
  datasISO: string[];
  audience: string;
}) {
  const { escolaId, datasISO, audience } = params;
  if (!escolaId || datasISO.length === 0) return;

  const alunosEscola = await prisma.student.findMany({
    where: { escolaId },
    include: { class: true },
  });

  const publicoNorm = normalizarTexto(audience);
  const paraTodaEscola =
    !publicoNorm || publicoNorm === 'toda a escola' || publicoNorm === 'todas as turmas';

  const alunosAlvo = paraTodaEscola
    ? alunosEscola
    : alunosEscola.filter((aluno) => {
        const nomeTurmaNorm = normalizarTexto(aluno.class?.name);
        return (
          nomeTurmaNorm === publicoNorm ||
          publicoNorm.includes(nomeTurmaNorm) ||
          nomeTurmaNorm.includes(publicoNorm)
        );
      });

  if (alunosAlvo.length === 0) return;

  for (const diaStr of datasISO) {
    const inicioDia = new Date(`${diaStr}T00:00:00.000-03:00`);
    const fimDia = new Date(`${diaStr}T23:59:59.999-03:00`);

    const chamadasExistentes = await prisma.attendance.findMany({
      where: {
        studentId: { in: alunosAlvo.map((a) => a.id) },
        date: { gte: inicioDia, lte: fimDia },
      },
    });

    const mapaChamadas = new Map(chamadasExistentes.map((c) => [c.studentId, c]));

    const paraCriar: Array<{
      studentId: string;
      classId: string;
      status: 'EXCUSED';
      date: Date;
    }> = [];
    const idsParaAtualizar: string[] = [];

    for (const aluno of alunosAlvo) {
      const existente = mapaChamadas.get(aluno.id);
      if (existente) {
        if (existente.status === 'ABSENT') {
          idsParaAtualizar.push(existente.id);
        }
      } else {
        paraCriar.push({
          studentId: aluno.id,
          classId: aluno.classId,
          status: 'EXCUSED',
          date: new Date(`${diaStr}T12:00:00.000-03:00`),
        });
      }
    }

    if (idsParaAtualizar.length > 0) {
      await prisma.attendance.updateMany({
        where: { id: { in: idsParaAtualizar } },
        data: { status: 'EXCUSED' },
      });
    }

    if (paraCriar.length > 0) {
      await prisma.attendance.createMany({
        data: paraCriar,
        skipDuplicates: true,
      });
    }
  }
}

async function removerAbonoEventoDasChamadas(params: {
  escolaId: string | null;
  datasISO: string[];
  audience: string;
  eventoIgnoradoId?: string;
}) {
  const { escolaId, datasISO, audience, eventoIgnoradoId } = params;
  if (!escolaId || datasISO.length === 0) return;

  const alunosEscola = await prisma.student.findMany({
    where: { escolaId },
    include: { class: true },
  });

  const publicoNorm = normalizarTexto(audience);
  const paraTodaEscola =
    !publicoNorm || publicoNorm === 'toda a escola' || publicoNorm === 'todas as turmas';

  const alunosAlvo = paraTodaEscola
    ? alunosEscola
    : alunosEscola.filter((aluno) => {
        const nomeTurmaNorm = normalizarTexto(aluno.class?.name);
        return (
          nomeTurmaNorm === publicoNorm ||
          publicoNorm.includes(nomeTurmaNorm) ||
          nomeTurmaNorm.includes(publicoNorm)
        );
      });

  if (alunosAlvo.length === 0) return;

  const outrosEventosComAbono = await prisma.event.findMany({
    where: {
      escolaId,
      excusesAbsence: true,
      ...(eventoIgnoradoId ? { NOT: { id: eventoIgnoradoId } } : {}),
    },
  });

  for (const diaStr of datasISO) {
    const outroEventoCobreDia = outrosEventosComAbono.some((ev) => {
      const datasEv = gerarDatasIntervalo(ev.startDate, ev.endDate);
      return datasEv.includes(diaStr);
    });

    if (outroEventoCobreDia) continue;

    const inicioDia = new Date(`${diaStr}T00:00:00.000-03:00`);
    const fimDia = new Date(`${diaStr}T23:59:59.999-03:00`);

    await prisma.attendance.deleteMany({
      where: {
        studentId: { in: alunosAlvo.map((a) => a.id) },
        status: 'EXCUSED',
        date: { gte: inicioDia, lte: fimDia },
      },
    });
  }
}

export class EventController {
  static async index(req: Request, res: Response) {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      let whereClause: any = {};

      if (user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.json([]);
        }
        whereClause = { escolaId: user.escolaId };
      }

      const events = await prisma.event.findMany({
        where: whereClause,
        orderBy: { startDate: 'asc' },
      });

      const formattedEvents = events.map((e) => {
        const dates = gerarDatasIntervalo(e.startDate, e.endDate);
        const publicoNorm = normalizarTexto(e.audience);
        const isEspecifico =
          e.excusesAbsence &&
          publicoNorm !== '' &&
          publicoNorm !== 'toda a escola' &&
          publicoNorm !== 'todas as turmas';

        return {
          ...e,
          dates,
          allowance: !e.excusesAbsence ? 'nenhum' : isEspecifico ? 'especificos' : 'escola',
        };
      });

      return res.json(formattedEvents);
    } catch (error) {
      console.error("Erro ao buscar eventos:", error);
      return res.status(500).json({ error: 'Erro ao buscar eventos.' });
    }
  }

  static async create(req: Request, res: Response) {
    const { title, dates, type, allowance, audience, description, color } = req.body;

    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      let escolaId = req.body.escolaId;

      if (user.role !== 'ADMIN') {
        if (!user.escolaId) {
          return res.status(403).json({ error: "Gestor sem escola vinculada não pode criar eventos." });
        }
        escolaId = user.escolaId;
      }

      const datasOrdenadas: string[] = Array.isArray(dates) && dates.length > 0 ? [...dates].sort() : [];
      const startDate = datasOrdenadas.length > 0 ? new Date(`${datasOrdenadas[0]}T12:00:00.000Z`) : new Date();
      const endDate =
        datasOrdenadas.length > 0
          ? new Date(`${datasOrdenadas[datasOrdenadas.length - 1]}T12:00:00.000Z`)
          : new Date();
      const excusesAbsence = allowance !== 'nenhum';
      const publicoFinal = audience || 'Toda a escola';

      const event = await prisma.event.create({
        data: {
          title: title || 'Sem título',
          description: description || null,
          color: color || null,
          startDate,
          endDate,
          type: type || 'Outro',
          excusesAbsence,
          audience: publicoFinal,
          escolaId,
        },
      });

      if (excusesAbsence && escolaId) {
        const datasParaAbonar =
          datasOrdenadas.length > 0 ? datasOrdenadas : gerarDatasIntervalo(startDate, endDate);
        await aplicarAbonoEventoNasChamadas({
          escolaId,
          datasISO: datasParaAbonar,
          audience: publicoFinal,
        });
      }

      return res.status(201).json(event);
    } catch (error) {
      console.error("Erro Prisma no Evento:", error);
      return res.status(500).json({ error: 'Erro ao criar evento.' });
    }
  }

  static async update(req: Request, res: Response) {
    const { id } = req.params;
    const { title, dates, type, allowance, audience, description, color } = req.body;

    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const eventoExistente = await prisma.event.findUnique({ where: { id: String(id) } });
      if (!eventoExistente) {
        return res.status(404).json({ error: "Evento não encontrado." });
      }

      if (user.role !== 'ADMIN' && eventoExistente.escolaId !== user.escolaId) {
        return res.status(403).json({ error: "Sem permissão para editar este evento." });
      }

      const updateData: any = {};
      if (title) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (color !== undefined) updateData.color = color;
      if (type) updateData.type = type;
      if (audience !== undefined) updateData.audience = audience;
      if (allowance !== undefined) updateData.excusesAbsence = allowance !== 'nenhum';

      const datasOrdenadas: string[] = Array.isArray(dates) && dates.length > 0 ? [...dates].sort() : [];
      if (datasOrdenadas.length > 0) {
        updateData.startDate = new Date(`${datasOrdenadas[0]}T12:00:00.000Z`);
        updateData.endDate = new Date(`${datasOrdenadas[datasOrdenadas.length - 1]}T12:00:00.000Z`);
      }

      const event = await prisma.event.update({
        where: { id: String(id) },
        data: updateData,
      });

      const datasAnteriores = gerarDatasIntervalo(eventoExistente.startDate, eventoExistente.endDate);
      const datasNovas =
        datasOrdenadas.length > 0 ? datasOrdenadas : gerarDatasIntervalo(event.startDate, event.endDate);

      if (eventoExistente.excusesAbsence) {
        await removerAbonoEventoDasChamadas({
          escolaId: event.escolaId,
          datasISO: datasAnteriores,
          audience: eventoExistente.audience,
          eventoIgnoradoId: event.id,
        });
      }

      if (event.excusesAbsence) {
        await aplicarAbonoEventoNasChamadas({
          escolaId: event.escolaId,
          datasISO: datasNovas,
          audience: event.audience,
        });
      }

      return res.json(event);
    } catch (error) {
      console.error("Erro ao atualizar evento:", error);
      return res.status(500).json({ error: 'Erro ao atualizar evento.' });
    }
  }

  static async delete(req: Request, res: Response) {
    const { id } = req.params;
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Usuário não autenticado." });
      }

      const eventoExistente = await prisma.event.findUnique({ where: { id: String(id) } });
      if (!eventoExistente) {
        return res.status(404).json({ error: "Evento não encontrado." });
      }

      if (user.role !== 'ADMIN' && eventoExistente.escolaId !== user.escolaId) {
        return res.status(403).json({ error: "Sem permissão para excluir este evento." });
      }

      await prisma.event.delete({ where: { id: String(id) } });

      if (eventoExistente.excusesAbsence) {
        const datasAnteriores = gerarDatasIntervalo(eventoExistente.startDate, eventoExistente.endDate);
        await removerAbonoEventoDasChamadas({
          escolaId: eventoExistente.escolaId,
          datasISO: datasAnteriores,
          audience: eventoExistente.audience,
          eventoIgnoradoId: eventoExistente.id,
        });
      }

      return res.status(204).send();
    } catch (error) {
      console.error("Erro ao deletar evento:", error);
      return res.status(500).json({ error: 'Erro ao excluir evento.' });
    }
  }
}