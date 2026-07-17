package provider

import (
  "bytes"
  "context"
  "encoding/json"
  "fmt"
  "io"
  "net/http"
  "net/url"
  "strings"
  "time"
)
type Client struct { endpoint, token, provisioningToken string; http *http.Client }
type APIError struct { StatusCode int; Body string }
func (e *APIError) Error() string { return fmt.Sprintf("OUTSIDE API returned %d: %s",e.StatusCode,e.Body) }
func NewClient(endpoint, token, provisioning string) (*Client,error) { parsed,err:=url.Parse(strings.TrimRight(endpoint,"/")); if err!=nil||parsed.Scheme!="https"||parsed.Host==""||parsed.User!=nil||parsed.RawQuery!=""||parsed.Fragment!="" { return nil,fmt.Errorf("endpoint must be a credential-free HTTPS URL without query or fragment") }; parsed.Path=strings.TrimRight(parsed.Path,"/"); return &Client{endpoint:parsed.String(),token:token,provisioningToken:provisioning,http:&http.Client{Timeout:20*time.Second,CheckRedirect:func(req *http.Request,via []*http.Request) error{return http.ErrUseLastResponse}}},nil }
func (c *Client) request(ctx context.Context, method,path string, body any, provisioning bool, out any) error { var reader io.Reader; if body!=nil { raw,err:=json.Marshal(body); if err!=nil{return err}; reader=bytes.NewReader(raw) }; req,err:=http.NewRequestWithContext(ctx,method,c.endpoint+path,reader); if err!=nil{return err}; req.Header.Set("Accept","application/json"); req.Header.Set("User-Agent","terraform-provider-outside/1.0"); if body!=nil{req.Header.Set("Content-Type","application/json")}; token:=c.token; if provisioning{token=c.provisioningToken}; if token==""{return fmt.Errorf("required OUTSIDE credential is not configured")}; req.Header.Set("Authorization","Bearer "+token); res,err:=c.http.Do(req); if err!=nil{return err}; defer res.Body.Close(); raw,err:=io.ReadAll(io.LimitReader(res.Body,2<<20)); if err!=nil{return err}; if res.StatusCode<200||res.StatusCode>=300{return &APIError{StatusCode:res.StatusCode,Body:string(raw)}}; if out!=nil&&len(raw)>0{return json.Unmarshal(raw,out)}; return nil }
