/* Ciudades con nombre en español: nombre|país|zona horaria|latitud|longitud.
   Tienen prioridad en la búsqueda y funcionan sin conexión. */
export const CITY_RAW = `Barcelona|España|Europe/Madrid|41.39|2.17
Madrid|España|Europe/Madrid|40.42|-3.70
Valencia|España|Europe/Madrid|39.47|-0.38
Sevilla|España|Europe/Madrid|37.39|-5.98
Bilbao|España|Europe/Madrid|43.26|-2.93
Palma de Mallorca|España|Europe/Madrid|39.57|2.65
Las Palmas de Gran Canaria|España|Atlantic/Canary|28.12|-15.43
Santa Cruz de Tenerife|España|Atlantic/Canary|28.47|-16.25
Lisboa|Portugal|Europe/Lisbon|38.72|-9.14
Oporto|Portugal|Europe/Lisbon|41.15|-8.61
Londres|Reino Unido|Europe/London|51.51|-0.13
Dublín|Irlanda|Europe/Dublin|53.35|-6.26
París|Francia|Europe/Paris|48.86|2.35
Ámsterdam|Países Bajos|Europe/Amsterdam|52.37|4.90
Bruselas|Bélgica|Europe/Brussels|50.85|4.35
Berlín|Alemania|Europe/Berlin|52.52|13.40
Múnich|Alemania|Europe/Berlin|48.14|11.58
Fráncfort|Alemania|Europe/Berlin|50.11|8.68
Zúrich|Suiza|Europe/Zurich|47.38|8.54
Milán|Italia|Europe/Rome|45.46|9.19
Roma|Italia|Europe/Rome|41.90|12.50
Nápoles|Italia|Europe/Rome|40.85|14.27
Viena|Austria|Europe/Vienna|48.21|16.37
Praga|Chequia|Europe/Prague|50.08|14.44
Budapest|Hungría|Europe/Budapest|47.50|19.04
Varsovia|Polonia|Europe/Warsaw|52.23|21.01
Copenhague|Dinamarca|Europe/Copenhagen|55.68|12.57
Estocolmo|Suecia|Europe/Stockholm|59.33|18.07
Oslo|Noruega|Europe/Oslo|59.91|10.75
Helsinki|Finlandia|Europe/Helsinki|60.17|24.94
Reikiavik|Islandia|Atlantic/Reykjavik|64.15|-21.94
Atenas|Grecia|Europe/Athens|37.98|23.73
Estambul|Turquía|Europe/Istanbul|41.01|28.98
Moscú|Rusia|Europe/Moscow|55.76|37.62
Nueva York|EE. UU.|America/New_York|40.71|-74.01
Boston|EE. UU.|America/New_York|42.36|-71.06
Miami|EE. UU.|America/New_York|25.76|-80.19
Chicago|EE. UU.|America/Chicago|41.88|-87.63
Denver|EE. UU.|America/Denver|39.74|-104.99
Los Ángeles|EE. UU.|America/Los_Angeles|34.05|-118.24
San Francisco|EE. UU.|America/Los_Angeles|37.77|-122.42
Seattle|EE. UU.|America/Los_Angeles|47.61|-122.33
Las Vegas|EE. UU.|America/Los_Angeles|36.17|-115.14
Honolulu|EE. UU.|Pacific/Honolulu|21.31|-157.86
Toronto|Canadá|America/Toronto|43.65|-79.38
Vancouver|Canadá|America/Vancouver|49.28|-123.12
Ciudad de México|México|America/Mexico_City|19.43|-99.13
Cancún|México|America/Cancun|21.16|-86.85
La Habana|Cuba|America/Havana|23.11|-82.37
Bogotá|Colombia|America/Bogota|4.71|-74.07
Medellín|Colombia|America/Bogota|6.24|-75.58
Lima|Perú|America/Lima|-12.05|-77.04
Quito|Ecuador|America/Guayaquil|-0.18|-78.47
Santiago|Chile|America/Santiago|-33.45|-70.67
Buenos Aires|Argentina|America/Argentina/Buenos_Aires|-34.60|-58.38
Montevideo|Uruguay|America/Montevideo|-34.90|-56.16
São Paulo|Brasil|America/Sao_Paulo|-23.55|-46.63
Río de Janeiro|Brasil|America/Sao_Paulo|-22.91|-43.17
Caracas|Venezuela|America/Caracas|10.48|-66.90
Panamá|Panamá|America/Panama|8.98|-79.52
San José|Costa Rica|America/Costa_Rica|9.93|-84.08
Santo Domingo|Rep. Dominicana|America/Santo_Domingo|18.49|-69.93
El Cairo|Egipto|Africa/Cairo|30.04|31.24
Marrakech|Marruecos|Africa/Casablanca|31.63|-8.01
Casablanca|Marruecos|Africa/Casablanca|33.57|-7.59
Túnez|Túnez|Africa/Tunis|36.81|10.18
Lagos|Nigeria|Africa/Lagos|6.52|3.38
Nairobi|Kenia|Africa/Nairobi|-1.29|36.82
Zanzíbar|Tanzania|Africa/Dar_es_Salaam|-6.16|39.19
Ciudad del Cabo|Sudáfrica|Africa/Johannesburg|-33.92|18.42
Johannesburgo|Sudáfrica|Africa/Johannesburg|-26.20|28.05
Dubái|Emiratos Árabes|Asia/Dubai|25.20|55.27
Abu Dabi|Emiratos Árabes|Asia/Dubai|24.45|54.38
Doha|Catar|Asia/Qatar|25.29|51.53
Riad|Arabia Saudí|Asia/Riyadh|24.71|46.68
Tel Aviv|Israel|Asia/Jerusalem|32.09|34.78
Ammán|Jordania|Asia/Amman|31.95|35.93
Tiflis|Georgia|Asia/Tbilisi|41.72|44.79
Almaty|Kazajistán|Asia/Almaty|43.24|76.89
Delhi|India|Asia/Kolkata|28.61|77.21
Bombay|India|Asia/Kolkata|19.08|72.88
Bangalore|India|Asia/Kolkata|12.97|77.59
Colombo|Sri Lanka|Asia/Colombo|6.93|79.86
Malé|Maldivas|Indian/Maldives|4.18|73.51
Katmandú|Nepal|Asia/Kathmandu|27.72|85.32
Daca|Bangladés|Asia/Dhaka|23.81|90.41
Bangkok|Tailandia|Asia/Bangkok|13.76|100.50
Chiang Mai|Tailandia|Asia/Bangkok|18.79|98.99
Hanói|Vietnam|Asia/Ho_Chi_Minh|21.03|105.85
Ho Chi Minh|Vietnam|Asia/Ho_Chi_Minh|10.82|106.63
Singapur|Singapur|Asia/Singapore|1.35|103.82
Kuala Lumpur|Malasia|Asia/Kuala_Lumpur|3.14|101.69
Bali (Denpasar)|Indonesia|Asia/Makassar|-8.65|115.22
Yakarta|Indonesia|Asia/Jakarta|-6.21|106.85
Manila|Filipinas|Asia/Manila|14.60|120.98
Hong Kong|China|Asia/Hong_Kong|22.32|114.17
Taipéi|Taiwán|Asia/Taipei|25.03|121.57
Pekín|China|Asia/Shanghai|39.90|116.41
Shanghái|China|Asia/Shanghai|31.23|121.47
Seúl|Corea del Sur|Asia/Seoul|37.57|126.98
Tokio|Japón|Asia/Tokyo|35.68|139.69
Osaka|Japón|Asia/Tokyo|34.69|135.50
Kioto|Japón|Asia/Tokyo|35.01|135.77
Sídney|Australia|Australia/Sydney|-33.87|151.21
Melbourne|Australia|Australia/Melbourne|-37.81|144.96
Brisbane|Australia|Australia/Brisbane|-27.47|153.03
Perth|Australia|Australia/Perth|-31.95|115.86
Auckland|Nueva Zelanda|Pacific/Auckland|-36.85|174.76
Suva|Fiyi|Pacific/Fiji|-18.14|178.44
Papeete|Polinesia Francesa|Pacific/Tahiti|-17.54|-149.57`;
