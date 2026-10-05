# Firebase para Academia de la Flota Estelar

La web funciona en modo local mientras `js/firebase-config.js` esté vacío. Los perfiles existentes permanecen en el navegador. Para activar sincronización, complete estos pasos con una cuenta que administre el proyecto Firebase.

## 1. Crear proyecto y aplicación Web

1. Entre en [Firebase Console](https://console.firebase.google.com/) y cree un proyecto.
2. En «Configuración del proyecto» → «Tus apps», registre una aplicación Web (`</>`).
3. Copie los valores de «Configuración del SDK» a `js/firebase-config.js`: `apiKey`, `authDomain`, `projectId` y `appId`. Puede conservar también otros campos públicos del objeto si Firebase se los muestra.
4. El objeto de configuración Web contiene identificadores públicos; nunca incluya claves privadas de cuentas de servicio.

El SDK modular se carga desde el CDN oficial de Firebase solo cuando la configuración está completa. No se necesita npm ni backend propio.

## 2. Activar Google Authentication

1. En Firebase Console abra «Authentication» → «Comenzar» → «Sign-in method».
2. Active «Google», seleccione el correo de soporte solicitado y guarde.
3. En «Authentication» → «Settings» → «Authorized domains», añada exactamente `robdor80.github.io` (sin `https://` y sin `/academiaflota/`). Para probar en desarrollo local, añada también `localhost` o el host local que use. Los proyectos recientes no siempre autorizan `localhost` por defecto.
4. Conserve el `authDomain` que entrega Firebase, normalmente `<projectId>.firebaseapp.com`. La web usa inicio de sesión con ventana emergente, apropiado para GitHub Pages. Si un navegador bloquea la ventana, permita ventanas emergentes para la página y repita el intento.

## 3. Crear Cloud Firestore y aplicar reglas

1. En Firebase Console abra «Firestore Database» → «Crear base de datos».
2. Seleccione la región deseada y cree la base de datos. No deje reglas abiertas en producción.
3. Abra la pestaña «Reglas», sustituya su contenido por [firestore.rules](firestore.rules) y pulse «Publicar».
4. Las reglas permiten lectura y escritura únicamente en `/users/{uid}/profiles/{profileId}` cuando el UID autenticado coincide con `{uid}`. No se permite leer otros usuarios ni borrar documentos directamente.

Cada documento contiene el objeto de perfil existente: `id`, `name`, `createdAt`, `updatedAt`, `studies`, `practices`, `evaluations` y cualquier otro campo del perfil. Un borrado se representa con `deletedAt` en ese mismo documento para que otros dispositivos también lo reciban. El documento padre `/users/{uid}` no hace falta crearlo.

## 4. Publicar y migrar perfiles anteriores

1. Publique los cambios de este repositorio en GitHub Pages: `https://robdor80.github.io/academiaflota/`.
2. Abra la web en el dispositivo que contiene los perfiles anteriores e inicie sesión con Google.
3. Cuando aparezca el aviso «Se han encontrado perfiles locales», pulse «Sincronizar perfiles».
4. Espere a que aparezca «Sincronización activa» antes de cerrar la página.
5. Abra la misma URL desde otro dispositivo e inicie sesión con **la misma cuenta Google**. Los perfiles deben aparecer allí.

La migración no borra los perfiles antiguos del navegador. Compara identificadores y no crea otra copia si el mismo `id` ya está en la cuenta; si coincide, gana el `updatedAt` más reciente. Dos perfiles distintos con el mismo nickname conservan sus identificadores y no se fusionan por nombre. Tras aceptar la migración, el navegador rota su caché de invitado: deja de mostrar esos perfiles en modo local y no los ofrece a otra cuenta Google. El modo local sigue admitiendo nuevos perfiles invitados, que también podrán migrarse expresamente después. Los anteriores se pueden recuperar con el JSON exportado o volviendo a esa cuenta.

## 5. Cómo se resuelven diferencias

- La caché local de cada cuenta se guarda en una clave separada por UID. Una cuenta nunca lee la caché de otra.
- Al iniciar sesión se muestra la caché de ese UID y se consulta Firestore. Para cada `id`, gana el objeto completo con `updatedAt` más reciente; en empate gana Firestore. Los cambios locales ganadores se suben.
- Los cambios se guardan inmediatamente en `localStorage`. Si la conexión falla, permanecen allí y se reintentan al volver la red o al regresar a la pestaña.
- Los borrados se sincronizan mediante `deletedAt`. Importar un JSON del mismo perfil vuelve a crearlo con una marca de tiempo nueva.
- Se usan los relojes de los dispositivos. Si un dispositivo tiene la hora incorrecta o dos dispositivos editan el mismo perfil a la vez, el último `updatedAt` puede sobrescribir cambios del otro. En esta primera versión no se fusionan campos individualmente. Exporte un JSON antes de manipular perfiles valiosos en varios dispositivos a la vez.
- Cerrar sesión retiene las cachés locales, pero deja de mostrar los perfiles del UID anterior. Los perfiles anteriores a Firebase siguen disponibles en modo local hasta que se migren.

## 6. Comprobación manual

1. **Móvil → PC:** cree «Kazan Rise» en móvil, estudie una unidad y espere «Sincronización activa». En PC, con la misma cuenta, compruebe nombre y unidad.
2. **PC → móvil:** complete un test en PC; en móvil abra la web de nuevo y compruebe la puntuación.
3. **Práctica:** guarde una respuesta y marque E-01 revisada en móvil; compruebe ambos datos en PC.
4. **Migración:** en un navegador con perfil anterior, inicie sesión y pulse «Sincronizar perfiles»; compruebe que conserva progreso y que aparece en otro dispositivo.
5. **Cuentas distintas:** cierre sesión, entre con otra cuenta Google y verifique que no se muestran perfiles de la primera. Vuelva a la primera y compruebe sus perfiles.
6. **Desconexión:** con sesión iniciada, desconecte la red, cambie progreso y vuelva a conectarla. Espere «Sincronización activa» y compruebe el cambio en otro dispositivo.

Si aparece «Error de sincronización», compruebe primero `firebase-config.js`, los dominios autorizados, Google Authentication, la base de datos Firestore y sus reglas.

Referencias oficiales: [configuración Web](https://firebase.google.com/docs/web/setup), [inicio de sesión con Google](https://firebase.google.com/docs/auth/web/google-signin), [reglas de Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions).
