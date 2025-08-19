/**
 * @module qrc-codec
 * @description
 * 此模块是加密与解密 QRC 歌词的核心。
 * 提供了两个主要的公共函数：`decryptQrc` 和 `encryptQrc`。
 *
 * 非标准 3DES 算法实现由 `custom_des` 模块提供。
 */

import { deflate, inflate } from "pako";
import { KEY_1, KEY_2, KEY_3 } from "./constants";
import { desCrypt, keySchedule, Mode } from "./custom_des";
import { hexToUint8Array, uint8ArrayToHex } from "./utils";

const DES_BLOCK_SIZE = 8;

/**
 * 非标准 3DES 编解码器
 */
class QqMusicCodec {
	private readonly encryptSchedule: number[][][];
	private readonly decryptSchedule: number[][][];

	constructor() {
		// 解密流程 D(K3) -> E(K2) -> D(K1)
		this.decryptSchedule = [
			keySchedule(KEY_3, Mode.Decrypt),
			keySchedule(KEY_2, Mode.Encrypt),
			keySchedule(KEY_1, Mode.Decrypt),
		];

		// 加密流程 E(K1) -> D(K2) -> E(K3)
		this.encryptSchedule = [
			keySchedule(KEY_1, Mode.Encrypt),
			keySchedule(KEY_2, Mode.Decrypt),
			keySchedule(KEY_3, Mode.Encrypt),
		];
	}

	/**
	 * 解密一个8字节的数据块。
	 */
	public decryptBlock(input: Uint8Array, output: Uint8Array): void {
		const temp1 = new Uint8Array(8);
		const temp2 = new Uint8Array(8);
		desCrypt(input, temp1, this.decryptSchedule[0]);
		desCrypt(temp1, temp2, this.decryptSchedule[1]);
		desCrypt(temp2, output, this.decryptSchedule[2]);
	}

	/**
	 * 加密一个8字节的数据块。
	 */
	public encryptBlock(input: Uint8Array, output: Uint8Array): void {
		const temp1 = new Uint8Array(8);
		const temp2 = new Uint8Array(8);
		desCrypt(input, temp1, this.encryptSchedule[0]);
		desCrypt(temp1, temp2, this.encryptSchedule[1]);
		desCrypt(temp2, output, this.encryptSchedule[2]);
	}
}

const CODEC = new QqMusicCodec();

/**
 * 使用零字节对数据进行填充。
 *
 * QQ音乐使用的填充方案是零填充。
 * @param data 需要填充的字节数据
 * @param blockSize 块大小，对于DES来说是8
 */
function zeroPad(data: Uint8Array, blockSize: number): Uint8Array {
	const paddingLen = (blockSize - (data.length % blockSize)) % blockSize;
	if (paddingLen === 0) {
		return data;
	}

	const paddedData = new Uint8Array(data.length + paddingLen);
	paddedData.set(data, 0);
	return paddedData;
}

/**
 * 使用 Zlib 解压缩字节数据。
 * 同时会尝试移除头部的 UTF-8 BOM (0xEF 0xBB 0xBF)。
 */
function decompress(data: Uint8Array): Uint8Array {
	const decompressed = inflate(data);
	if (
		decompressed.length >= 3 &&
		decompressed[0] === 0xef &&
		decompressed[1] === 0xbb &&
		decompressed[2] === 0xbf
	) {
		return decompressed.slice(3);
	}
	return decompressed;
}

/**
 * 对加密文本执行解密操作。
 * @param encryptedHexString 加密的十六进制字符串
 */
export function decryptQrc(encryptedHexString: string): string {
	const encryptedBytes = hexToUint8Array(encryptedHexString);

	if (encryptedBytes.length % DES_BLOCK_SIZE !== 0) {
		throw new Error(`加密数据长度不是${DES_BLOCK_SIZE}的倍数`);
	}

	const decryptedData = new Uint8Array(encryptedBytes.length);

	for (let i = 0; i < encryptedBytes.length; i += DES_BLOCK_SIZE) {
		const chunk = encryptedBytes.subarray(i, i + DES_BLOCK_SIZE);
		const outChunk = decryptedData.subarray(i, i + DES_BLOCK_SIZE);
		CODEC.decryptBlock(chunk, outChunk);
	}

	const decompressedBytes = decompress(decryptedData);

	return new TextDecoder("utf-8").decode(decompressedBytes);
}

/**
 * 对明文歌词执行加密操作。
 * @param plaintext 明文字符串
 */
export function encryptQrc(plaintext: string): string {
	const textBytes = new TextEncoder().encode(plaintext);

	const compressedData = deflate(textBytes);

	const paddedData = zeroPad(compressedData, DES_BLOCK_SIZE);

	const encryptedData = new Uint8Array(paddedData.length);

	for (let i = 0; i < paddedData.length; i += DES_BLOCK_SIZE) {
		const chunk = paddedData.subarray(i, i + DES_BLOCK_SIZE);
		const outChunk = encryptedData.subarray(i, i + DES_BLOCK_SIZE);
		CODEC.encryptBlock(chunk, outChunk);
	}

	return uint8ArrayToHex(encryptedData);
}
