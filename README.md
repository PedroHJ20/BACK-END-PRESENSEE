# PresenSee Backend

API REST do PresenSee, construída com Express, TypeScript e Prisma. A API registra usuários, turmas, alunos, presenças, alertas, ocorrências e eventos escolares.

## Executar localmente

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Configure as variáveis de ambiente em `.env`:

   ```env
   DATABASE_URL="postgresql://usuario:senha@localhost:5432/presensee"
   JWT_SECRET="substitua-por-um-segredo-forte"
   PORT=3333

   CLOUDINARY_CLOUD_NAME="seu-cloud-name"
   CLOUDINARY_API_KEY="sua-api-key"
   CLOUDINARY_API_SECRET="seu-api-secret"
   ```

   `DATABASE_URL` aponta para o banco PostgreSQL. As três variáveis do Cloudinary são necessárias para o upload de biometria. `PORT` é opcional e, se omitido, a API usa `3333`. Configure `JWT_SECRET` com o mesmo valor em todas as instâncias para que os tokens emitidos no login possam ser validados.

3. Gere o cliente Prisma e aplique as migrations existentes:

   ```bash
   npx prisma generate
   npx prisma migrate deploy
   ```

4. Inicie o servidor em modo de desenvolvimento:

   ```bash
   npm run dev
   ```

A API fica disponível em `http://localhost:3333` (ou na porta definida em `PORT`). Os exemplos abaixo usam `http://localhost:3333` como URL base.

## Autenticação

`GET /api/status`, `POST /api/login` e `POST /api/setup` são públicos. Todas as demais rotas exigem um JWT no cabeçalho:

```http
Authorization: Bearer <token>
```

O token é retornado por `POST /api/login` e expira em um dia. Sem token, a resposta é `401`:

```json
{ "error": "Token não fornecido. Acesso negado." }
```

Com token inválido ou expirado, a resposta é `401`:

```json
{ "error": "Token inválido ou expirado." }
```

## Endpoints

### Status

#### `GET /api/status` — público

Não recebe parâmetros nem corpo.

**Resposta `200`:**

```json
{ "message": "O backend do PresenSee está vivo e estruturado!" }
```

### Autenticação

#### `POST /api/setup` — público

Cria um usuário. O campo `role` é opcional e aceita `ADMIN`, `MANAGER`, `TEACHER` ou `MONITOR`; quando omitido, o código define `ADMIN`.

**Corpo (`application/json`):**

```json
{
  "name": "Ana Silva",
  "email": "ana@escola.com",
  "password": "senha-segura",
  "role": "ADMIN"
}
```

**Resposta `201`:**

```json
{
  "message": "Administrador criado com sucesso!",
  "user": {
    "id": "uuid",
    "email": "ana@escola.com"
  }
}
```

Se o e-mail já estiver cadastrado, retorna `400`:

```json
{ "error": "Usuário já existe no banco de dados." }
```

Em caso de erro interno, retorna `500` com `{ "error": "Erro ao criar administrador." }`.

> Esta rota é pública e cria usuários; restrinja-a ou desabilite-a após a configuração inicial em ambientes expostos.

#### `POST /api/login` — público

**Corpo (`application/json`):**

```json
{
  "email": "ana@escola.com",
  "password": "senha-segura"
}
```

**Resposta `200`:**

```json
{
  "user": {
    "id": "uuid",
    "name": "Ana Silva",
    "email": "ana@escola.com",
    "role": "ADMIN"
  },
  "token": "<jwt>"
}
```

Credenciais inválidas retornam `401`:

```json
{ "error": "Email ou senha inválidos." }
```

Erro interno retorna `500` com `{ "error": "Erro interno ao realizar login." }`.

### Dashboard

#### `GET /api/dashboard` — protegido

Não recebe parâmetros nem corpo.

**Resposta `200`:**

```json
{
  "totalStudents": 1,
  "highRisk": 0,
  "mediumRisk": 0,
  "lowRisk": 1,
  "overallFrequency": 100,
  "classesSummary": [
    {
      "id": "uuid",
      "name": "1º Ano A",
      "course": "Ensino Médio",
      "shift": "Manhã",
      "studentsCount": 1,
      "frequency": 100
    }
  ]
}
```

As frequências são porcentagens inteiras. Sem registros, a frequência é `100`. Erro interno retorna `500` com `{ "error": "Erro ao carregar dados do dashboard." }`.

### Turmas

#### `POST /api/classes` — protegido

**Corpo (`application/json`):**

```json
{
  "name": "1º Ano A",
  "year": 2026,
  "course": "Ensino Médio",
  "shift": "Manhã"
}
```

**Resposta `201`:** objeto da turma criada, incluindo os campos abaixo:

```json
{
  "id": "uuid",
  "name": "1º Ano A",
  "year": 2026,
  "course": "Ensino Médio",
  "shift": "Manhã",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

Erro interno retorna `500` com `{ "error": "Erro ao criar turma." }`.

#### `GET /api/classes` — protegido

Não recebe parâmetros nem corpo.

**Resposta `200`:** lista de objetos de turma com o mesmo formato de `POST /api/classes`. Se não houver turmas, retorna `[]`. Erro interno retorna `500` com `{ "error": "Erro ao buscar as turmas." }`.

### Alunos

#### `POST /api/students` — protegido

**Corpo (`application/json`):**

```json
{
  "registration": "2026001",
  "name": "João da Silva",
  "email": "joao@escola.com",
  "birthDate": "2010-05-15T00:00:00.000Z",
  "classId": "uuid-da-turma"
}
```

`birthDate` é opcional; se omitido, fica `null`.

**Resposta `201`:** objeto completo do aluno criado:

```json
{
  "id": "uuid",
  "registration": "2026001",
  "name": "João da Silva",
  "email": "joao@escola.com",
  "birthDate": "2010-05-15T00:00:00.000Z",
  "biometricDataUrl": null,
  "biometricEncoding": null,
  "classId": "uuid-da-turma",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

Erro interno ou dados incompatíveis com o banco retornam `500` com `{ "error": "Erro ao cadastrar o aluno. Verifique os dados." }`.

#### `GET /api/students` — protegido

Não recebe parâmetros nem corpo. Retorna a lista de alunos, cada qual com a turma relacionada e os campos calculados `frequency` e `risk`. O array de presenças não é incluído.

**Resposta `200` (exemplo):**

```json
[
  {
    "id": "uuid",
    "registration": "2026001",
    "name": "João da Silva",
    "email": "joao@escola.com",
    "birthDate": "2010-05-15T00:00:00.000Z",
    "biometricDataUrl": null,
    "biometricEncoding": null,
    "classId": "uuid-da-turma",
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z",
    "class": {
      "id": "uuid-da-turma",
      "name": "1º Ano A",
      "year": 2026,
      "course": "Ensino Médio",
      "shift": "Manhã",
      "createdAt": "2026-01-01T00:00:00.000Z"
    },
    "frequency": 100,
    "risk": "Baixo"
  }
]
```

`risk` é `Alto` para frequência menor que 75%, `Médio` de 75% até 85% (inclusive) e `Baixo` acima de 85%. Sem presenças, `frequency` é `100`. Erro interno retorna `500` com `{ "error": "Erro ao buscar os alunos." }`.

#### `PATCH /api/students/:id/biometry` — protegido

Envia uma imagem como `multipart/form-data`, no campo `photo`. Os formatos aceitos pelo armazenamento configurado são JPG, JPEG e PNG.

**Exemplo de campos do formulário:**

```text
photo: <arquivo de imagem>
```

**Resposta `200`:**

```json
{
  "message": "Biometria atualizada com sucesso na nuvem!",
  "student": {
    "id": "uuid",
    "registration": "2026001",
    "name": "João da Silva",
    "email": "joao@escola.com",
    "biometricDataUrl": "https://res.cloudinary.com/...",
    "classId": "uuid-da-turma"
  }
}
```

O objeto `student` contém os campos do aluno; a URL salva fica em `biometricDataUrl`. Se o campo `photo` não for enviado, retorna `400`:

```json
{ "error": "Nenhuma imagem foi enviada." }
```

Falha no upload pelo middleware retorna `500`:

```json
{ "error": "Falha na nuvem", "detalhes": "mensagem do erro" }
```

Outros erros retornam `500` com `{ "error": "Erro ao atualizar biometria." }`.

#### `GET /api/students/:id/attendance-history` — protegido

Retorna as presenças do aluno em ordem cronológica. `month` e `year` são parâmetros de consulta opcionais, mas o filtro mensal só é aplicado quando ambos são informados. `month` usa valores de `1` a `12`.

**Exemplo:**

```http
GET /api/students/uuid-do-aluno/attendance-history?month=9&year=2026
```

**Resposta `200`:**

```json
[
  {
    "id": "uuid",
    "date": "2026-09-10T12:00:00.000Z",
    "status": "PRESENT",
    "studentId": "uuid-do-aluno",
    "classId": "uuid-da-turma"
  }
]
```

`status` pode ser `PRESENT`, `ABSENT` ou `EXCUSED`. Erro interno retorna `500` com `{ "error": "Erro ao buscar o histórico de presença." }`.

### Frequência e alertas

#### `POST /api/attendances` — protegido

Registra presença como `PRESENT` com a data/hora atual. O status não é recebido do cliente.

**Corpo (`application/json`):**

```json
{
  "studentId": "uuid-do-aluno",
  "classId": "uuid-da-turma"
}
```

**Resposta `201`:**

```json
{
  "message": "Presença registrada com sucesso pela câmera!",
  "attendance": {
    "id": "uuid",
    "date": "2026-09-10T12:00:00.000Z",
    "status": "PRESENT",
    "studentId": "uuid-do-aluno",
    "classId": "uuid-da-turma"
  }
}
```

Erro interno, incluindo conflito com a restrição de presença única por aluno/data, retorna `500` com `{ "error": "Erro ao processar o check-in da câmera." }`.

#### `GET /api/alerts` — protegido

Não recebe parâmetros nem corpo.

**Resposta `200`:** lista de alertas, cada um com o aluno relacionado:

```json
[
  {
    "id": "uuid",
    "reason": "4 faltas consecutivas",
    "status": "PENDING",
    "studentId": "uuid-do-aluno",
    "createdAt": "2026-09-10T12:00:00.000Z",
    "resolvedAt": null,
    "student": {
      "id": "uuid-do-aluno",
      "name": "João da Silva",
      "registration": "2026001",
      "email": "joao@escola.com"
    }
  }
]
```

O aluno inclui os campos do modelo `Student`. Erro interno retorna `500` com `{ "error": "Erro ao buscar alertas." }`.

### Ocorrências e intervenções

#### `GET /api/incidents` — protegido

Não recebe parâmetros nem corpo. Retorna ocorrências da mais recente para a mais antiga; cada ocorrência inclui `student` e a `class` desse aluno.

**Resposta `200` (formato resumido):**

```json
[
  {
    "id": "uuid",
    "type": "Atraso",
    "description": "Chegou após o início da aula",
    "date": "2026-09-10T12:00:00.000Z",
    "studentId": "uuid-do-aluno",
    "student": {
      "id": "uuid-do-aluno",
      "name": "João da Silva",
      "class": {
        "id": "uuid-da-turma",
        "name": "1º Ano A"
      }
    }
  }
]
```

Os objetos `student` e `class` incluem seus demais campos do modelo. Erro interno retorna `500` com `{ "error": "Erro ao buscar intervenções." }`.

#### `POST /api/incidents` — protegido

**Corpo (`application/json`):**

```json
{
  "type": "Atraso",
  "description": "Chegou após o início da aula",
  "studentId": "uuid-do-aluno"
}
```

**Resposta `201`:** objeto da ocorrência criada, incluindo `student` e a `class` relacionada, no mesmo formato de `GET /api/incidents`.

Erro interno retorna `500` com `{ "error": "Erro ao registrar intervenção." }`.

### Eventos

#### `GET /api/events` — protegido

Não recebe parâmetros nem corpo. Retorna eventos ordenados por `startDate` crescente.

**Resposta `200`:**

```json
[
  {
    "id": "uuid",
    "title": "Reunião de responsáveis",
    "startDate": "2026-09-15T18:00:00.000Z",
    "endDate": "2026-09-15T19:00:00.000Z",
    "type": "Reunião",
    "excusesAbsence": false,
    "audience": "Responsáveis",
    "createdAt": "2026-09-10T12:00:00.000Z",
    "updatedAt": "2026-09-10T12:00:00.000Z"
  }
]
```

Sem eventos, retorna `[]`. Erro interno retorna `500` com `{ "error": "Erro ao buscar eventos do calendário." }`.

#### `POST /api/events` — protegido

**Corpo (`application/json`):**

```json
{
  "title": "Reunião de responsáveis",
  "startDate": "2026-09-15T18:00:00.000Z",
  "endDate": "2026-09-15T19:00:00.000Z",
  "type": "Reunião",
  "excusesAbsence": false,
  "audience": "Responsáveis"
}
```

**Resposta `201`:** objeto do evento criado, com os campos e o formato de `GET /api/events`.

Erro interno retorna `500` com `{ "error": "Erro ao criar evento." }`.

#### `DELETE /api/events/:id` — protegido

O identificador do evento é enviado na URL; não há corpo.

```http
DELETE /api/events/uuid-do-evento
```

**Resposta `204`:** sem corpo.

Erro interno retorna `500` com `{ "error": "Erro ao excluir evento." }`.

## Observações sobre respostas de erro

As rotas protegidas exigem autenticação antes de chegar ao controller. Nos controllers, erros de banco ou de processamento normalmente são respondidos com `500`; os exemplos acima mostram a mensagem definida por cada rota. A API não implementa validação explícita dos campos obrigatórios nos controllers, então dados ausentes ou inválidos podem resultar em erro do banco e resposta `500`.
