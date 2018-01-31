import { CipherString } from '../models/domain/cipherString';
import { PasswordHistory } from '../models/domain/passwordHistory';

import { UtilsService } from './utils.service';

import { CryptoService } from '../abstractions/crypto.service';
import {
    PasswordGenerationService as PasswordGenerationServiceAbstraction,
} from '../abstractions/passwordGeneration.service';
import { StorageService } from '../abstractions/storage.service';

const DefaultOptions = {
    length: 14,
    ambiguous: false,
    number: true,
    minNumber: 1,
    uppercase: true,
    minUppercase: 1,
    lowercase: true,
    minLowercase: 1,
    special: false,
    minSpecial: 1,
};

const Keys = {
    options: 'passwordGenerationOptions',
    history: 'generatedPasswordHistory',
};

const MaxPasswordsInHistory = 100;

export class PasswordGenerationService implements PasswordGenerationServiceAbstraction {
    static generatePassword(options: any): string {
        // overload defaults with given options
        const o = Object.assign({}, DefaultOptions, options);

        // sanitize
        if (o.uppercase && o.minUppercase < 0) {
            o.minUppercase = 1;
        }
        if (o.lowercase && o.minLowercase < 0) {
            o.minLowercase = 1;
        }
        if (o.number && o.minNumber < 0) {
            o.minNumber = 1;
        }
        if (o.special && o.minSpecial < 0) {
            o.minSpecial = 1;
        }

        if (!o.length || o.length < 1) {
            o.length = 10;
        }

        const minLength: number = o.minUppercase + o.minLowercase + o.minNumber + o.minSpecial;
        if (o.length < minLength) {
            o.length = minLength;
        }

        const positions: string[] = [];
        if (o.lowercase && o.minLowercase > 0) {
            for (let i = 0; i < o.minLowercase; i++) {
                positions.push('l');
            }
        }
        if (o.uppercase && o.minUppercase > 0) {
            for (let i = 0; i < o.minUppercase; i++) {
                positions.push('u');
            }
        }
        if (o.number && o.minNumber > 0) {
            for (let i = 0; i < o.minNumber; i++) {
                positions.push('n');
            }
        }
        if (o.special && o.minSpecial > 0) {
            for (let i = 0; i < o.minSpecial; i++) {
                positions.push('s');
            }
        }
        while (positions.length < o.length) {
            positions.push('a');
        }

        // shuffle
        positions.sort(() => {
            return UtilsService.secureRandomNumber(0, 1) * 2 - 1;
        });

        // build out the char sets
        let allCharSet = '';

        let lowercaseCharSet = 'abcdefghijkmnopqrstuvwxyz';
        if (o.ambiguous) {
            lowercaseCharSet += 'l';
        }
        if (o.lowercase) {
            allCharSet += lowercaseCharSet;
        }

        let uppercaseCharSet = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';
        if (o.ambiguous) {
            uppercaseCharSet += 'O';
        }
        if (o.uppercase) {
            allCharSet += uppercaseCharSet;
        }

        let numberCharSet = '23456789';
        if (o.ambiguous) {
            numberCharSet += '01';
        }
        if (o.number) {
            allCharSet += numberCharSet;
        }

        const specialCharSet = '!@#$%^&*';
        if (o.special) {
            allCharSet += specialCharSet;
        }

        let password = '';
        for (let i = 0; i < o.length; i++) {
            let positionChars: string;
            switch (positions[i]) {
                case 'l':
                    positionChars = lowercaseCharSet;
                    break;
                case 'u':
                    positionChars = uppercaseCharSet;
                    break;
                case 'n':
                    positionChars = numberCharSet;
                    break;
                case 's':
                    positionChars = specialCharSet;
                    break;
                case 'a':
                    positionChars = allCharSet;
                    break;
            }

            const randomCharIndex = UtilsService.secureRandomNumber(0, positionChars.length - 1);
            password += positionChars.charAt(randomCharIndex);
        }

        return password;
    }

    private optionsCache: any;
    private history: PasswordHistory[] = [];

    constructor(private cryptoService: CryptoService, private storageService: StorageService) {
    }

    generatePassword(options: any) {
        return PasswordGenerationService.generatePassword(options);
    }

    async getOptions() {
        if (this.optionsCache == null) {
            const options = await this.storageService.get(Keys.options);
            if (options == null) {
                this.optionsCache = DefaultOptions;
            } else {
                this.optionsCache = options;
            }
        }

        return this.optionsCache;
    }

    async saveOptions(options: any) {
        await this.storageService.save(Keys.options, options);
        this.optionsCache = options;
    }

    async getHistory(): Promise<PasswordHistory[]> {
        const hasKey = (await this.cryptoService.getKey()) != null;
        if (!hasKey) {
            return new Array<PasswordHistory>();
        }

        if (!this.history) {
            const encrypted = await this.storageService.get<PasswordHistory[]>(Keys.history);
            this.history = await this.decryptHistory(encrypted);
        }

        return this.history || new Array<PasswordHistory>();
    }

    async addHistory(password: string): Promise<any> {
        // Cannot add new history if no key is available
        const hasKey = (await this.cryptoService.getKey()) != null;
        if (!hasKey) {
            return;
        }

        const currentHistory = await this.getHistory();

        // Prevent duplicates
        if (this.matchesPrevious(password, currentHistory)) {
            return;
        }

        currentHistory.push(new PasswordHistory(password, Date.now()));

        // Remove old items.
        if (currentHistory.length > MaxPasswordsInHistory) {
            currentHistory.shift();
        }

        const newHistory = await this.encryptHistory(currentHistory);
        return await this.storageService.save(Keys.history, newHistory);
    }

    async clear(): Promise<any> {
        this.history = [];
        return await this.storageService.remove(Keys.history);
    }

    private async encryptHistory(history: PasswordHistory[]): Promise<PasswordHistory[]> {
        if (history == null || history.length === 0) {
            return Promise.resolve([]);
        }

        const promises = history.map(async (item) => {
            const encrypted = await this.cryptoService.encrypt(item.password);
            return new PasswordHistory(encrypted.encryptedString, item.date);
        });

        return await Promise.all(promises);
    }

    private async decryptHistory(history: PasswordHistory[]): Promise<PasswordHistory[]> {
        if (history == null || history.length === 0) {
            return Promise.resolve([]);
        }

        const promises = history.map(async (item) => {
            const decrypted = await this.cryptoService.decrypt(new CipherString(item.password));
            return new PasswordHistory(decrypted, item.date);
        });

        return await Promise.all(promises);
    }

    private matchesPrevious(password: string, history: PasswordHistory[]): boolean {
        if (history == null || history.length === 0) {
            return false;
        }

        return history[history.length - 1].password === password;
    }
}
