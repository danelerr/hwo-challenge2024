import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import exoplanets from './exoplanets.json' assert { type: 'json' };

// Inicializar la app de Express
const app = express();
const MIN_SNR = 5; // Relación señal-ruido mínima
const PAGE_SIZE = 10;
// Utilidad para calcular SNR
/*
    PARAMETROS POR DEFECTO Y FORMULA ULIZADA DE ACUERDO CON LA DESCRIPCIÓN DEL PROBLEMA
*/

/**
 * Calcula la Relación Señal-Ruido (SNR) para la observación de un exoplaneta
 * @param {number} R - Radio de la estrella en radios solares
 * @param {number} Rp - Radio del planeta en radios terrestres
 * @param {number} D - Diámetro del telescopio en metros
 * @param {number} Es - Distancia al sistema planetario en parsecs
 * @param {number} Ps - Distancia entre el planeta y su estrella (semieje mayor) en UA (unidades astronómicas)
 * @param {number} snr0 - Valor base de SNR (por defecto 100)
 * @param {number} D0 - Diámetro de referencia del telescopio (por defecto 6 metros)
 * @param {number} Es0 - Distancia de referencia al sistema planetario (por defecto 10 parsecs)
 * @returns {number} - La Relación Señal-Ruido calculada
 */
function calcularSNR(R, Rp, D, Es, Ps, snr0 = 100, D0 = 6, Es0 = 10) {
    return snr0 * ((R * Rp * (D / D0)) / ((Es / Es0) * Ps)) ** 2;
}

// Ruta para obtener planetas por diámetro de telescopio
app.get('/telescope/:diameter', (req, res) => {
    const diameter = parseInt(req.params.diameter, 10);

    /*
        DE ACUERDO CON LA DESCRIPCION DEL PROBLEMA, DIAMETRO DEL LENTE DE HWO VARIAN ENTRE  5 A 15.
    */
    if (diameter < 5 || diameter > 15) {
        return res.status(400).json({ error: "invalid diameter" });
    }

    // Convertir coordenadas (dec -> dec_radians y ra -> ra_radians)
    exoplanets.forEach(planet => {
        planet.dec_radians = planet.dec * Math.PI / 180;
        planet.ra_radians = Math.PI / 2 - planet.ra * Math.PI / 180;
    });

    // Filtrar planetas que cumplan con el SNR mínimo y calcular isVisibleByHWO
    const filteredPlanets = exoplanets.map(planet => {
        const snr = calcularSNR(
            planet.st_rad,        // Radio de la estrella
            planet.pl_rade,       // Radio del planeta
            diameter,             // Diámetro del telescopio
            planet.sy_dist,       // Distancia al sistema planetario
            planet.pl_orbsmax     // Distancia planeta-estrella
        );
        
        planet.ESmax = 15 * (diameter / 6) / planet.pl_orbsmax; // Distancia límite de separación

        // Determinar si el planeta es caracterizable por el HWO
        const isVisibleByHWO = snr > MIN_SNR && planet.sy_dist < planet.ESmax;

        // Devolver el planeta con el nuevo atributo
        return {
            ...planet,
            isVisibleByHWO
        };
    });

    res.json(filteredPlanets);
});




app.get('/planets', (req, res) => {
    const page = parseInt(req.query.page) || 1; // Página actual, por defecto 1
    const pageSize = parseInt(req.query.size) || PAGE_SIZE; // Tamaño por página, por defecto 10
    const diameter = parseInt(req.query.diameter) || 6; // Diámetro del telescopio, por defecto 6

    const startIndex = (page - 1) * pageSize;
    const endIndex = page * pageSize;

    const filteredPlanets = exoplanets.map(planet => {
        const snr = calcularSNR(
            planet.st_rad,        // Radio de la estrella
            planet.pl_rade,       // Radio del planeta
            diameter,             // Diámetro del telescopio
            planet.sy_dist,       // Distancia al sistema planetario
            planet.pl_orbsmax     // Distancia planeta-estrella
        );
        const esMax = 15 * (diameter / 6) / planet.pl_orbsmax;
        return {
            ...planet,
            snr: snr.toFixed(2),
            esMax: esMax.toFixed(2),
            isVisibleByHWO: snr > MIN_SNR && planet.sy_dist < esMax
        };
    });

    // Paginar los planetas filtradosSS
    const paginatedPlanets = filteredPlanets.slice(startIndex, endIndex);

    res.json({
        page,
        pageSize,
        total: filteredPlanets.length,
        planets: paginatedPlanets
    });
});



// Ruta principal para renderizar HTML
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>HWO Exoplanet Hackathon</title>
        <link href="https://cdn.jsdelivr.net/npm/bulma@0.9.3/css/bulma.min.css" rel="stylesheet">
    </head>
    <body>
        <section class="section">
            <div class="container">
                <h1 class="title">HWO Exoplanet Hackathon</h1>
                <div class="field">
                    <label class="label">Telescope Diameter (5-15m)</label>
                    <input class="slider" type="range" min="5" max="15" value="6" step="1" id="diameterRange">
                    <p>Diameter: <span id="diameterValue">6</span>m</p>
                </div>

                <div class="field">
                    <label class="label">Search Exoplanets</label>
                    <div class="control">
                        <input class="input" type="text" id="searchInput" placeholder="Search exoplanets by name">
                    </div>
                </div>

                <table class="table is-striped is-fullwidth">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Hostname</th>
                            <th>SNR</th>
                            <th>ESmax</th>
                            <th>Visible by HWO</th>
                        </tr>
                    </thead>
                    <tbody id="planetTableBody">
                        <!-- Data will be dynamically inserted here -->
                    </tbody>
                </table>

                <nav class="pagination" role="navigation" aria-label="pagination">
                    <a class="pagination-previous" id="prevPage">Previous</a>
                    <a class="pagination-next" id="nextPage">Next</a>
                    <ul class="pagination-list">
                        <!-- Pagination numbers will go here -->
                    </ul>
                </nav>
            </div>
        </section>

        <script>
            document.getElementById('diameterRange').addEventListener('input', function() {
                document.getElementById('diameterValue').textContent = this.value;
                loadPlanets();
            });

            document.getElementById('searchInput').addEventListener('input', loadPlanets);

            let currentPage = 1;

            async function loadPlanets() {
                const diameter = document.getElementById('diameterRange').value;
                const searchQuery = document.getElementById('searchInput').value;
                const response = await fetch(\`/planets?page=\${currentPage}&diameter=\${diameter}\`);
                const data = await response.json();
                
                const tableBody = document.getElementById('planetTableBody');
                tableBody.innerHTML = '';

                data.planets
                    .filter(planet => planet.pl_name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .forEach(planet => {
                        const row = document.createElement('tr');
                        row.innerHTML = \`
                            <td>\${planet.pl_name}</td>
                            <td>\${planet.hostname}</td>
                            <td>\${planet.snr}</td>
                            <td>\${planet.esMax}</td>
                            <td>\${planet.isVisibleByHWO ? 'Yes' : 'No'}</td>
                        \`;
                        tableBody.appendChild(row);
                    });
            }

            document.getElementById('prevPage').addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    loadPlanets();
                }
            });

            document.getElementById('nextPage').addEventListener('click', () => {
                currentPage++;
                loadPlanets();
            });

            loadPlanets();
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// Iniciar el servidor
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
