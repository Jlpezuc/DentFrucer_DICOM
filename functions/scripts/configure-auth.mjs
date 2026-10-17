// Configura la seguridad de Firebase Authentication del proyecto (una vez):
//   - verificación en dos pasos con app de autenticación (TOTP)
//   - política de contraseñas: mínimo 10 caracteres, con números
//   - protección contra enumeración de correos (no revela si un correo existe)
//
// Requiere haber actualizado Authentication a "Identity Platform" (ver
// FIREBASE.md → Seguridad) y credenciales de Google con permiso sobre el
// proyecto:
//   gcloud auth application-default login
//   cd functions && node scripts/configure-auth.mjs SU-PROYECTO
import process from 'node:process';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const projectId = process.argv[2] || process.env.GOOGLE_CLOUD_PROJECT;
if (!projectId) {
  console.error('Uso: node scripts/configure-auth.mjs ID-DEL-PROYECTO');
  process.exit(1);
}
initializeApp({ projectId });

const config = await getAuth().projectConfigManager().updateProjectConfig({
  multiFactorConfig: { providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 1 } }] },
  passwordPolicyConfig: { enforcementState: 'ENFORCE', forceUpgradeOnSignin: false, constraints: { minLength: 10, requireNumeric: true } },
  emailPrivacyConfig: { enableImprovedEmailPrivacy: true }
});
console.log('Listo. Configuración de Authentication de', projectId + ':');
console.log(JSON.stringify(config.toJSON(), null, 2));
