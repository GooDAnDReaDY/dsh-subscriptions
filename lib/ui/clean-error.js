// Error text normalizer extracted verbatim from client.js (#266).
function cleanErrorMessage(raw) {
      if (!raw) return ''
      var text = typeof raw === 'string' ? raw : (raw.message || String(raw))
      text = text.trim()
      if (text.charAt(0) === '{' && text.charAt(text.length - 1) === '}') {
        try {
          var parsed = JSON.parse(text)
          if (parsed.error && parsed.error.message) text = parsed.error.message
          else if (parsed.message) text = parsed.message
          else if (parsed.code) text = parsed.code
        } catch (e) {}
      }
      var firstLine = text.split('\n')[0].trim()
      if (firstLine.length > 160) return firstLine.slice(0, 157) + '...'
      return firstLine
    }
