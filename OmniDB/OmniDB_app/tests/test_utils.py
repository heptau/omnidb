from django.test import TestCase
import OmniDB_app.include.Spartacus.Utils as Utils


class UtilsTest(TestCase):
    def test_base64_encode(self):
        result = Utils.Base64Encode('test string')
        self.assertEqual(result, 'dGVzdCBzdHJpbmc=')

    def test_base64_decode(self):
        result = Utils.Base64Decode('dGVzdCBzdHJpbmc=')
        self.assertEqual(result, 'test string')

    def test_base64_encode_decode(self):
        original = 'Hello World! 123'
        encoded = Utils.Base64Encode(original)
        decoded = Utils.Base64Decode(encoded)
        self.assertEqual(decoded, original)


class CryptorTest(TestCase):
    def test_encrypt_decrypt(self):
        cryptor = Utils.Cryptor(p_key='test_key', p_encoding='utf-8')
        original = 'secret message'
        encrypted = cryptor.Encrypt(original)
        decrypted = cryptor.Decrypt(encrypted)
        self.assertEqual(decrypted, original)

    def test_encrypt_produces_output(self):
        cryptor = Utils.Cryptor(p_key='test_key', p_encoding='utf-8')
        text = 'same text'
        enc = cryptor.Encrypt(text)
        self.assertIsInstance(enc, str)
        self.assertTrue(len(enc) > 0)

    def test_decrypt_invalid_raises(self):
        cryptor = Utils.Cryptor(p_key='test_key', p_encoding='utf-8')
        with self.assertRaises(Exception):
            cryptor.Decrypt('invalid_data')


class DataToJsonTest(TestCase):
    def test_simple_types(self):
        result = Utils.DataToJson(None)
        self.assertEqual(result, 'null')

        result = Utils.DataToJson(True)
        self.assertEqual(result, 'true')

        result = Utils.DataToJson(123)
        self.assertEqual(result, '123')

        result = Utils.DataToJson('text')
        self.assertEqual(result, '"text"')

    def test_list_conversion(self):
        result = Utils.DataToJson([1, 2, 3])
        self.assertEqual(result, '[1, 2, 3]')

    def test_dict_conversion(self):
        result = Utils.DataToJson({'key': 'value'})
        self.assertEqual(result, '{"key": "value"}')


class JsonToDataTest(TestCase):
    def test_simple_types(self):
        result = Utils.JsonToData('null')
        self.assertIsNone(result)

        result = Utils.JsonToData('true')
        self.assertTrue(result)

        result = Utils.JsonToData('123')
        self.assertEqual(result, 123)

        result = Utils.JsonToData('"text"')
        self.assertEqual(result, 'text')

    def test_list_conversion(self):
        result = Utils.JsonToData('[1,2,3]')
        self.assertEqual(result, [1, 2, 3])

    def test_dict_conversion(self):
        result = Utils.JsonToData('{"key":"value"}')
        self.assertEqual(result, {'key': 'value'})


class GetFileSizeTest(TestCase):
    def test_bytes(self):
        result = Utils.GetFileSize(100)
        self.assertEqual(result, '100 B')

    def test_kilobytes(self):
        result = Utils.GetFileSize(1024)
        self.assertIn('KB', result)

    def test_megabytes(self):
        result = Utils.GetFileSize(1024 * 1024)
        self.assertIn('MB', result)

    def test_gigabytes(self):
        result = Utils.GetFileSize(1024 * 1024 * 1024)
        self.assertIn('GB', result)


class GetDateTimeTest(TestCase):
    def test_returns_string(self):
        result = Utils.GetDateTime()
        self.assertIsInstance(result, str)

    def test_format(self):
        result = Utils.GetDateTime()
        self.assertIn('-', result)
        self.assertIn(':', result)


class GetDateTest(TestCase):
    def test_returns_string(self):
        result = Utils.GetDate()
        self.assertIsInstance(result, str)

    def test_format(self):
        result = Utils.GetDate()
        self.assertIn('-', result)


class GetTimestampTest(TestCase):
    def test_returns_string(self):
        result = Utils.GetTimestamp()
        self.assertIsInstance(result, str)