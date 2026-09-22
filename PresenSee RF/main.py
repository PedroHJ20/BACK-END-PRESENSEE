import cv2
import face_recognition
import numpy as np
from datetime import datetime
import os
import requests

# CONFIGURAÇÕES DA API (NUVEM)

BASE_URL = "https://back-end-presensee.onrender.com"
API_LOGIN = f"{BASE_URL}/api/login"
API_ATTENDANCES = f"{BASE_URL}/api/attendances"
API_STUDENTS = f"{BASE_URL}/api/students"
CLASS_ID = "7497a23a-f471-49fa-9591-c739b6e396c2" # Turma 1º Ano A

# Credenciais da Câmera (O script usará isto para obter o token sozinho)
CREDENCIAIS_CAMERA = {
    "email": "admin@presensee.com",
    "password": "senha_segura_123"
}

print('🔐 Autenticando a câmera no sistema...')
HEADERS = {}

try:
    resposta_login = requests.post(API_LOGIN, json=CREDENCIAIS_CAMERA)
    if resposta_login.status_code == 200:
        dados_login = resposta_login.json()
        token_fresco = dados_login.get("token")
        
        # Montar os cabeçalhos com o token novo gerado na hora!
        HEADERS = {
            "Authorization": f"Bearer {token_fresco}",
            "Content-Type": "application/json"
        }
        print('✅ Autenticação concluída com sucesso! Token gerado.')
    else:
        print(f"❌ Erro de login da câmera: {resposta_login.text}")
        exit()
except Exception as e:
    print(f"❌ Erro ao tentar conectar para login: {e}")
    exit()



ALUNOS_DB = {}
images = []
classNames = []

print('📡 Sincronizando com o banco de dados na nuvem...')
try:
    # A requisição agora passa o token de segurança
    resposta = requests.get(API_STUDENTS, headers=HEADERS)
    if resposta.status_code == 200:
        alunos_nuvem = resposta.json()
        
        for aluno in alunos_nuvem:
            nome = aluno['name']
            aluno_id = aluno['id']
            foto_url = aluno.get('biometricDataUrl')

            if foto_url:
                link_completo = f"{BASE_URL}{foto_url}"
                print(f"⏳ Baixando biometria de: {nome}...")
                # Não precisa de token para baixar a imagem direto do Cloudinary, mas se a rota exigir, pode manter
                img_resp = requests.get(link_completo)
                
                if img_resp.status_code == 200:
                    img_array = np.asarray(bytearray(img_resp.content), dtype="uint8")
                    img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
                    
                    if img is not None:
                        images.append(img)
                        classNames.append(nome)
                        ALUNOS_DB[nome] = aluno_id
                        print(f"✅ Sucesso: Rosto de {nome} aprendido!")
                else:
                    print(f"⚠️ Aviso: Foto de {nome} não encontrada no servidor (Erro {img_resp.status_code}).")
    else:
        print(f"❌ Erro ao buscar a lista de alunos na API (Erro {resposta.status_code}).")
except Exception as e:
    print(f"❌ Erro crítico de conexão com a API: {e}")

if not images:
    print("Nenhum aluno com foto válida foi carregado. A câmera não pode reconhecer ninguém. Encerrando.")
    exit()


# RECONHECIMENTO FACIAL

def findEncodings(images):
    encodeList = []
    for img in images:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        encodes = face_recognition.face_encodings(img)
        if encodes:
            encodeList.append(encodes[0])
    return encodeList

print('\n🧠 Treinando a Inteligência Artificial...')
encodeListKnown = findEncodings(images)
print('🎥 Sistema pronto. Abrindo a câmera...\n')

def registrar_presenca(name):
    if not os.path.isfile('diario_classe.csv'):
        open('diario_classe.csv', 'w').close()
        
    with open('diario_classe.csv', 'r+') as f:
        myDataList = f.readlines()
        nameList = [line.split(',')[0] for line in myDataList]
        
        if name not in nameList:
            now = datetime.now()
            dtString = now.strftime('%H:%M:%S')
            f.writelines(f'{name},{dtString}\n')
            print(f"📸 Câmera: {name} detectado às {dtString}")
            
            student_id = ALUNOS_DB.get(name)
            if student_id:
                dados = {
                    "studentId": student_id,
                    "classId": CLASS_ID,
                    "status": "PRESENT"
                }
                try:
                    # O POST agora envia os dados E o token de segurança
                    resposta_presenca = requests.post(API_ATTENDANCES, json=dados, headers=HEADERS)
                    if resposta_presenca.status_code == 201:
                        print(f"✅ NUVEM: Presença de {name} salva no banco de dados!")
                    else:
                        print(f"⚠️ NUVEM Recusou: {resposta_presenca.text}")
                except Exception as e:
                    print(f"❌ ERRO ao enviar presença: {e}")

cap = cv2.VideoCapture(0)

while True:
    success, img = cap.read()
    imgS = cv2.resize(img, (0, 0), None, 0.25, 0.25)
    imgS = cv2.cvtColor(imgS, cv2.COLOR_BGR2RGB)

    facesCurFrame = face_recognition.face_locations(imgS)
    encodesCurFrame = face_recognition.face_encodings(imgS, facesCurFrame)

    for encodeFace, faceLoc in zip(encodesCurFrame, facesCurFrame):
        matches = face_recognition.compare_faces(encodeListKnown, encodeFace)
        faceDis = face_recognition.face_distance(encodeListKnown, encodeFace)
        
        if len(faceDis) > 0:
            matchIndex = np.argmin(faceDis)

            if matches[matchIndex]:
                name = classNames[matchIndex]
                y1, x2, y2, x1 = faceLoc
                y1, x2, y2, x1 = y1*4, x2*4, y2*4, x1*4 
                
                cv2.rectangle(img, (x1, y1), (x2, y2), (255, 255, 0), 2)
                cv2.rectangle(img, (x1, y2-35), (x2, y2), (255, 255, 0), cv2.FILLED)
                cv2.putText(img, f'{name}', (x1+6, y2-6), cv2.FONT_HERSHEY_DUPLEX, 0.6, (0, 0, 0), 1)
                
                registrar_presenca(name)

    cv2.imshow('PresenSee - Leitor Facial', img)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break
        
cap.release()
cv2.destroyAllWindows()