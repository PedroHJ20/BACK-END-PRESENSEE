import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash('123456', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@presensee.com' },
    update: { 
      password: passwordHash 
    },
    create: {
      name: 'Pedro Admin',
      email: 'admin@presensee.com',
      password: passwordHash,
      role: 'ADMIN',
      primeiroAcesso: false,
    },
  });

  console.log('✅ Administrador pronto para uso com a senha atualizada:', admin.email);
}

main()
  .catch((e) => {
    console.error('❌ Erro ao criar/atualizar admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });