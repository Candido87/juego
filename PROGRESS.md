# PROGRESS

## Hecho
- [x] Hito 0 — Vista isométrica, lógica pura, cintas, taladros, torre básica, oleadas, tests.

## Hoja de ruta unificada
Tres encargos fusionados en un solo orden según sus dependencias. Entre paréntesis, el hito original:
A = árbol/torretas/murallas/industria/NPCs, E = electricidad y automatización, T = aspecto de torretas.

- [x] 1. (A1) Sistema de NPCs y cola de trabajos (construcción por NPC con una sola torreta de balas).
- [x] 2. (A2) Piezas y recetas nuevas; las construcciones consumen piezas concretas.
- [x] 3. (A3) Transportistas: reparto de munición y piezas por NPC (modo manual).
- [ ] 4. (E1) Redes eléctricas: generador de combustión, postes y cables, consumo/producción, apagón parcial.
- [ ] 5. (E2) Cintas motorizadas y diferencia entre modo manual (NPC) y automático.
- [ ] 6. (E3) Alimentadores automáticos y torretas con abastecimiento automático.
- [ ] 7. (E4) Baterías, solar y prioridades de consumo.
- [ ] 8. (A4 + E5) Torretas láser (energía) y de fuego (combustible); enemigos que atacan la infraestructura.
- [ ] 9. (T1) Registro de aspectos por torreta y modelos distintos para balas, láser y fuego.
- [ ] 10. (T2) Piezas animadas (cabeza que gira, retroceso, cristal, llamas) y efectos de disparo distintos.
- [ ] 11. (T3) Variantes por nivel y estados (sin munición/energía, en construcción, dañada).
- [ ] 12. (T4) Resto de tipos (hielo) con su modelo y efectos.
- [ ] 13. (A5) Murallas y comportamiento de los enemigos ante ellas.
- [ ] 14. (A6 + E6) Árbol de tecnología con pantalla propia, incluida la rama "Energía y automatización".
- [ ] 15. (A7) Variedad de enemigos y oleadas que exijan mezclar torretas.
- [ ] 16. (E7 + T5) Interfaz: paneles de red, indicadores, cables; iconos de torretas en el menú y ficha al pasar el ratón.
- [ ] 17. (A8 + E8) Equilibrado con `npm run sim` y pulido (incluida legibilidad con zoom).

Por qué este orden: el modo manual (transportistas) debe existir antes de que la electricidad lo
automatice; el láser depende de la red; el aspecto de las torretas (T) va cuando ya existen láser, fuego
y la energía (para el estado "sin energía"); el árbol necesita que existan sus desbloqueos.

Regla: tras cada hito, tests + tipos + build en verde, commit y push a `main`.
