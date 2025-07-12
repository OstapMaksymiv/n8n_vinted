const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Логування
const log = (message) => {
    console.log(`[${new Date().toISOString()}] ${message}`);
};

// Функція для завантаження фото
const downloadImage = async (url, filepath) => {
    try {
        const response = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
        });
        
        const writer = fs.createWriteStream(filepath);
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (error) {
        throw new Error(`Помилка завантаження фото: ${error.message}`);
    }
};

// Функція для входу в Vinted
const loginToVinted = async (page, email, password, baseUrl = 'https://www.vinted.pl') => {
  try {
    log('Відкриваємо головну Vinted…');
    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Приймаємо cookies, якщо є
    try {
      await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 5000 });
      await page.click('#onetrust-accept-btn-handler');
    } catch (_) {}

    // Натискаємо “Zaloguj się” / “Login”
    await page.waitForSelector('[data-testid="header--login-button"]', { timeout: 10000 });
    await page.click('[data-testid="header--login-button"]');

    // Чекаємо появи полів форми
    await page.waitForSelector('input[name="user[login]"]', { timeout: 10000 });

    await page.type('input[name="user[login]"]', email, { delay: 30 });
    await page.type('input[name="user[password]"]', password, { delay: 30 });

    await page.click('button[type="submit"]');

    // Чекаємо, поки редіректне назад на головну
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 });

    log('✅ Логін успішний');
    return true;
  } catch (err) {
    log(`❌ Помилка логіну: ${err.message}`);
    return false;
  }
};

// Функція для завантаження товару
const uploadToVinted = async (page, productData) => {
    try {
        log('Перехід на сторінку додавання товару...');
        await page.goto('https://www.vinted.pl/items/new', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });

        // Завантаження фото
        if (productData.photoUrl) {
            log('Завантаження фото...');
            const photoPath = path.join(__dirname, 'temp_photo.jpg');
            
            try {
                await downloadImage(productData.photoUrl, photoPath);
                
                // Знаходимо input для завантаження фото
                const fileInput = await page.$('input[type="file"]');
                if (fileInput) {
                    await fileInput.uploadFile(photoPath);
                    await page.waitForTimeout(3000); // Чекаємо завантаження
                }
                
                // Видаляємо тимчасовий файл
                fs.unlinkSync(photoPath);
            } catch (photoError) {
                log(`Помилка завантаження фото: ${photoError.message}`);
            }
        }

        // Заповнюємо назву товару
        if (productData.title) {
            await page.waitForSelector('input[name="item[title]"]', { timeout: 5000 });
            await page.type('input[name="item[title]"]', productData.title);
        }

        // Заповнюємо опис
        if (productData.description) {
            await page.waitForSelector('textarea[name="item[description]"]', { timeout: 5000 });
            await page.type('textarea[name="item[description]"]', productData.description);
        }

        // Вибираємо категорію (якщо є)
        if (productData.category) {
            try {
                await page.click('select[name="item[catalog_id]"]');
                await page.select('select[name="item[catalog_id]"]', productData.category);
            } catch (error) {
                log(`Не вдалося вибрати категорію: ${error.message}`);
            }
        }

        // Вибираємо бренд
        if (productData.brand) {
            try {
                await page.waitForSelector('input[name="item[brand_id]"]', { timeout: 5000 });
                await page.type('input[name="item[brand_id]"]', productData.brand);
                await page.waitForTimeout(1000);
                
                // Вибираємо перший варіант з автодоповнення
                const firstOption = await page.$('.brand-suggestions li:first-child');
                if (firstOption) {
                    await firstOption.click();
                }
            } catch (error) {
                log(`Не вдалося вибрати бренд: ${error.message}`);
            }
        }

        // Заповнюємо розмір
        if (productData.size) {
            try {
                await page.waitForSelector('select[name="item[size_id]"]', { timeout: 5000 });
                await page.select('select[name="item[size_id]"]', productData.size);
            } catch (error) {
                log(`Не вдалося вибрати розмір: ${error.message}`);
            }
        }

        // Заповнюємо стан товару
        if (productData.condition) {
            try {
                await page.waitForSelector('select[name="item[status_id]"]', { timeout: 5000 });
                await page.select('select[name="item[status_id]"]', productData.condition);
            } catch (error) {
                log(`Не вдалося вибрати стан: ${error.message}`);
            }
        }

        // Заповнюємо ціну
        if (productData.price) {
            await page.waitForSelector('input[name="item[price]"]', { timeout: 5000 });
            await page.type('input[name="item[price]"]', productData.price.toString());
        }

        // Публікуємо товар
        log('Публікація товару...');
        await page.click('button[type="submit"]');
        
        // Очікуємо успішної публікації
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
        
        log('Товар успішно опубліковано');
        return { success: true, message: 'Товар успішно опубліковано на Vinted' };
        
    } catch (error) {
        log(`Помилка публікації: ${error.message}`);
        return { success: false, error: error.message };
    }
};
app.get('/popa',(req,res) => {
    res.send('asd')
})
// API endpoint для завантаження на Vinted
app.post('/upload-to-vinted', async (req, res) => {
    let browser;
    
    try {
        log('Отримано запит на завантаження товару');
        
        const { productData } = req.body;
        const email  = process.env.VINTED_EMAIL;
        const password = process.env.VINTED_PASSWORD;
    
        if (!email || !password) {
              return res.status(500).json({
                success: false,
                error: 'VINTED_EMAIL or VINTED_PASSWORD not set on server'
              });
        }
        
        if (!productData) {
            return res.status(400).json({ 
                success: false, 
                error: 'Відсутні дані товару' 
            });
        }

        // Запускаємо браузер
        log('Запуск браузера...');
        browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });

        const page = await browser.newPage();
        
        // Налаштовуємо viewport
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Налаштовуємо User-Agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // Входимо в акаунт
        const loginSuccess = await loginToVinted(page, email, password);
        
        if (!loginSuccess) {
            await browser.close();
            return res.status(401).json({ 
                success: false, 
                error: 'Не вдалося увійти в акаунт Vinted' 
            });
        }

        // Завантажуємо товар
        const result = await uploadToVinted(page, productData);
        
        await browser.close();
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
        
    } catch (error) {
        log(`Глобальна помилка: ${error.message}`);
        
        if (browser) {
            await browser.close();
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Запуск сервера
app.listen(PORT, () => {
    log(`Сервер запущено на порту ${PORT}`);
});

module.exports = app;