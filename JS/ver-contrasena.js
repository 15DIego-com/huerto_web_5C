// ===== Ojito para mostrar / ocultar la contraseña =====
// Se agrega solo a todos los campos de contraseña de la página.
(function () {
    'use strict';

    const OJO =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>' +
        '<circle cx="12" cy="12" r="3"/></svg>';

    const OJO_TACHADO =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>' +
        '<path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>' +
        '<path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/>' +
        '<line x1="1" y1="1" x2="23" y2="23"/></svg>';

    // Cambia el campo y el ícono según si la contraseña se ve o no
    function ponerEstado(campo, boton, visible) {
        campo.type = visible ? 'text' : 'password';
        boton.innerHTML = visible ? OJO_TACHADO : OJO;
        boton.title = visible ? 'Ocultar contraseña' : 'Mostrar contraseña';
        boton.setAttribute('aria-label', boton.title);
        boton.setAttribute('aria-pressed', visible ? 'true' : 'false');
    }

    document.querySelectorAll('input[type="password"]').forEach(function (campo) {
        if (campo.dataset.conOjo) return;   // por si el script se carga dos veces
        campo.dataset.conOjo = '1';

        // Se envuelve el campo para poner el botón a su lado
        const envoltura = document.createElement('span');
        envoltura.className = 'campo-pass';
        campo.parentNode.insertBefore(envoltura, campo);
        envoltura.appendChild(campo);

        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'ver-pass';
        ponerEstado(campo, boton, false);

        boton.addEventListener('click', function () {
            ponerEstado(campo, boton, campo.type === 'password');
        });

        envoltura.appendChild(boton);
    });

    // Al limpiar un formulario (por ejemplo "Volver a intentar"), se vuelven a ocultar
    document.addEventListener('reset', function (evento) {
        evento.target.querySelectorAll('.campo-pass').forEach(function (envoltura) {
            const campo = envoltura.querySelector('input');
            const boton = envoltura.querySelector('.ver-pass');
            if (campo && boton) ponerEstado(campo, boton, false);
        });
    }, true);
})();