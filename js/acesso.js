// Acessos de editor: login por usuário e senha, e a tela onde o organizador cria e remove editores.
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updatePassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, onSnapshot, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const DOMINIO = "@editores.mococa-esportes.app";
const limparUsuario = u => u.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9._-]/g, "");
export const emailDe = u => limparUsuario(u) + DOMINIO;
export const usuarioDe = email => (email || "").endsWith(DOMINIO) ? email.slice(0, -DOMINIO.length) : email;

export function entrarEditor(auth, usuario, senha) {
  return signInWithEmailAndPassword(auth, emailDe(usuario), senha);
}

export function trocarSenha(auth, nova) {
  return updatePassword(auth.currentUser, nova);
}

// Cria o login num app separado para o organizador continuar logado
export async function criarEditor(firebaseConfig, db, { usuario, nome, senha }) {
  const u = limparUsuario(usuario);
  if (u.length < 3) throw new Error("usuario-curto");
  if ((senha || "").length < 6) throw new Error("senha-curta");
  const sec = initializeApp(firebaseConfig, "criar-editor-" + Date.now());
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(sec), u + DOMINIO, senha);
    await setDoc(doc(db, "editores", cred.user.uid), { usuario: u, nome: nome || u, criado: Date.now() });
    await signOut(getAuth(sec));
    return u;
  } finally { deleteApp(sec).catch(() => {}); }
}

export function ouvirEditores(db, cb) {
  return onSnapshot(collection(db, "editores"), s => cb(s.docs.map(d => ({ uid: d.id, ...d.data() })).sort((a, b) => a.usuario.localeCompare(b.usuario))), () => cb([]));
}
export function ouvirSouEditor(db, uid, cb) {
  return onSnapshot(doc(db, "editores", uid), s => cb(s.exists()), () => cb(false));
}
export function removerEditor(db, uid) { return deleteDoc(doc(db, "editores", uid)); }
