import type { Request, Response } from "express";
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Configuração do disparador de e-mails (Atualizada para deploy na nuvem)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // true para porta 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

export class SchoolController {
  static async create(req: Request, res: Response) {
    try {
      // Extraindo os dados da escola e do gestor enviados pelo front-end
      const { 
        nome, municipio, rede, status, 
        inep, cep, logradouro, numero, 
        complemento, bairro, uf, telefone,
        gestorNome, gestorEmail
      } = req.body;

      if (!gestorNome || !gestorEmail) {
        return res.status(400).json({ error: "É obrigatório informar o Nome e E-mail do gestor responsável." });
      }

      // Verifica se o e-mail do gestor já existe
      const userExists = await prisma.user.findUnique({ where: { email: gestorEmail } });
      if (userExists) {
        return res.status(400).json({ error: 'Já existe um usuário cadastrado com este e-mail.' });
      }

      // Gera uma senha provisória aleatória de 8 caracteres
      const senhaProvisoria = crypto.randomBytes(4).toString('hex');
      const hashedPassword = await bcrypt.hash(senhaProvisoria, 10);

      // Inicia a transação conjunta (Cria Escola e Gestor juntos)
      const novaEscola = await prisma.$transaction(async (tx) => {
        // 1. Cria a Escola
        const escola = await tx.escola.create({
          data: {
            nome, municipio, rede, status: status || "Pendente",
            inep, cep, logradouro, numero, complemento, bairro, uf, telefone
          }
        });

        // 2. Cria o Gestor vinculado
        await tx.user.create({
          data: {
            name: gestorNome,
            email: gestorEmail,
            password: hashedPassword,
            role: "MANAGER",
            escolaId: escola.id,
            primeiroAcesso: true // Força a troca de senha no primeiro login
          }
        });

        return escola;
      });

      // 3. Dispara o e-mail de boas-vindas
      try {
        await transporter.sendMail({
          from: `"PresenSee" <${process.env.SMTP_USER}>`,
          to: gestorEmail,
          subject: "Bem-vindo ao PresenSee - Suas credenciais de acesso",
          html: `
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px;">
              <h2 style="color: #633df2;">Olá, ${gestorNome}!</h2>
              <p>Seja bem-vindo(a) ao <strong>PresenSee</strong>!</p>
              <p>O cadastro da sua instituição de ensino foi realizado com sucesso. A partir de agora, você poderá acessar nossa plataforma para acompanhar e gerenciar as informações da sua escola.</p>
              
              <div style="background-color: #f8f6ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #633df2;">Dados de acesso:</h3>
                <ul style="list-style: none; padding: 0; margin: 0;">
                  <li style="margin-bottom: 8px;"><strong>Instituição:</strong> ${nome}</li>
                  <li style="margin-bottom: 8px;"><strong>E-mail:</strong> ${gestorEmail}</li>
                  <li style="margin-bottom: 8px;"><strong>Senha provisória:</strong> <span style="background: #e2e4f2; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${senhaProvisoria}</span></li>
                </ul>
              </div>

              <p><strong>Acesso à plataforma:</strong> <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" style="color: #633df2; text-decoration: none; font-weight: bold;">Acessar o PresenSee</a></p>
              
              <p style="color: #e53935; font-size: 0.9em; background: #ffebee; padding: 10px; border-radius: 6px;">
                <strong>Importante:</strong> Por questões de segurança, no seu primeiro acesso será necessário alterar a senha provisória e cadastrar uma nova senha pessoal.
              </p>

              <p style="font-size: 0.9em; color: #666; margin-top: 30px;">
                Caso tenha alguma dificuldade para acessar sua conta, entre em contato com nossa equipe de suporte.
              </p>
              
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="font-size: 0.9em; color: #666; margin: 0;">Atenciosamente,</p>
              <p style="font-size: 1em; color: #333; margin: 5px 0 0 0;"><strong>Equipe PresenSee</strong></p>
              <p style="font-size: 0.8em; color: #999; margin: 0;"><em>Tecnologia e inteligência para uma educação mais presente.</em></p>
            </div>
          `
        });
      } catch (emailError) {
        console.error("Erro ao enviar e-mail (a escola foi criada, mas o e-mail falhou):", emailError);
      }

      return res.status(201).json({ message: "Escola e gestor criados com sucesso!", escola: novaEscola });
    } catch (error) {
      console.error("Erro ao criar escola:", error);
      return res.status(500).json({ error: "Erro interno ao criar a escola." });
    }
  }

  static async index(req: Request, res: Response) {
    try {
      const escolas = await prisma.escola.findMany({
        include: { users: true } 
      });
      return res.json(escolas);
    } catch (error) {
      console.error("Erro ao buscar escolas:", error);
      return res.status(500).json({ error: "Erro interno ao listar as escolas." });
    }
  }

  static async updateStatus(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      const { status } = req.body;
      const escola = await prisma.escola.update({
        where: { id },
        data: { status }
      });
      return res.json(escola);
    } catch (error) {
      console.error("Erro ao atualizar status da escola:", error);
      return res.status(500).json({ error: "Erro ao atualizar status." });
    }
  }

  static async delete(req: Request, res: Response) {
    try {
      const id = req.params.id as string;
      // Como o Prisma Schema tem onDelete: Cascade, o gestor será excluído automaticamente
      await prisma.escola.delete({ 
        where: { id } 
      });
      return res.status(204).send();
    } catch (error) {
      console.error("Erro ao excluir escola:", error);
      return res.status(500).json({ error: "Erro ao excluir escola." });
    }
  }
}